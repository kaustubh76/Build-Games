/**
 * AI Debate Service
 * Multi-agent debate system for prediction market analysis
 * Inspired by Simmer Markets - AI agents research, debate, and forecast
 */

import { prisma } from '@/lib/prisma';
import {
  UnifiedMarket,
  MarketSource,
  DebateResult,
  DebateRound,
  DebateSource,
  DebateAgentRole,
} from '@/types/externalMarket';
import {
  chatCompletion as zgChatCompletion,
  isZgComputeConfigured,
} from '@/services/zgComputeService';
import { safeParseAIResponse } from '@/lib/safeParseAIResponse';

// ============================================
// CONSTANTS
// ============================================

const DEBATE_ROUNDS = 3;
const MAX_SOURCES_PER_AGENT = 5;

// Agent system prompts
const AGENT_PROMPTS: Record<DebateAgentRole, string> = {
  bull: `You are a Bull Agent arguing FOR the YES outcome. Present the strongest case for why this prediction should resolve YES. Use evidence, data, and logical reasoning. Be persuasive but honest. Focus on:
- Recent news and developments supporting YES
- Historical patterns favoring YES
- Expert opinions predicting YES
- Statistical trends indicating YES likelihood`,

  bear: `You are a Bear Agent arguing FOR the NO outcome. Present the strongest case for why this prediction should resolve NO. Use evidence, data, and logical reasoning. Be persuasive but honest. Focus on:
- Factors that could prevent YES from happening
- Historical cases where similar predictions failed
- Expert opinions predicting NO
- Risks and uncertainties that favor NO`,

  neutral: `You are a Neutral Agent providing balanced analysis. Present both sides objectively and highlight key uncertainties. Focus on:
- Summarizing the strongest arguments for both sides
- Identifying the most important factors
- Acknowledging unknowns and limitations
- Estimating probability ranges`,

  supervisor: `You are the Supervisor Agent synthesizing the debate. Analyze all arguments and provide a final probability estimate. Consider:
- Quality of evidence presented by each side
- Strength of logical arguments
- Historical accuracy of similar predictions
- Current market sentiment vs fundamentals
Provide a final probability (0-100%) for YES outcome with confidence level (0-100%).`,
};

// ============================================
// TYPES
// ============================================

interface ResearchResult {
  agentRole: DebateAgentRole;
  sources: DebateSource[];
  keyPoints: string[];
}

interface DebateAgentResponse {
  argument: string;
  confidence: number;
  sources: string[];
}

// ============================================
// AI DEBATE SERVICE
// ============================================

class AIDebateService {
  /**
   * Conduct a full multi-agent debate on a market
   */
  async conductDebate(
    marketId: string,
    question: string,
    source: MarketSource = MarketSource.NATIVE
  ): Promise<DebateResult> {
    // Create debate record
    const debate = await prisma.aIDebate.create({
      data: {
        marketId,
        question,
        source,
        status: 'in_progress',
      },
    });

    try {
      const rounds: DebateRound[] = [];

      // Phase 1: Research (parallel)
      const [bullResearch, bearResearch, neutralResearch] = await Promise.all([
        this.conductResearch(question, 'bull'),
        this.conductResearch(question, 'bear'),
        this.conductResearch(question, 'neutral'),
      ]);

      // Phase 2: Round 1 - Initial Arguments
      const round1Bull = await this.generateArgument('bull', question, bullResearch, []);
      rounds.push(await this.saveRound(debate.id, 1, 'bull', round1Bull));

      const round1Bear = await this.generateArgument('bear', question, bearResearch, []);
      rounds.push(await this.saveRound(debate.id, 1, 'bear', round1Bear));

      const round1Neutral = await this.generateArgument('neutral', question, neutralResearch, []);
      rounds.push(await this.saveRound(debate.id, 1, 'neutral', round1Neutral));

      // Phase 3: Round 2 - Rebuttals
      const round2Bull = await this.generateRebuttal('bull', question, rounds);
      rounds.push(await this.saveRound(debate.id, 2, 'bull', round2Bull));

      const round2Bear = await this.generateRebuttal('bear', question, rounds);
      rounds.push(await this.saveRound(debate.id, 2, 'bear', round2Bear));

      // Phase 4: Round 3 - Supervisor Synthesis
      const synthesis = await this.synthesizeDebate(question, rounds);
      rounds.push(await this.saveRound(debate.id, 3, 'supervisor', synthesis));

      // Extract final prediction from synthesis
      const finalPrediction = this.extractPrediction(synthesis.argument);

      // Collect all sources
      const allSources = [
        ...bullResearch.sources,
        ...bearResearch.sources,
        ...neutralResearch.sources,
      ];

      // Extract key factors
      const keyFactors = this.extractKeyFactors(rounds);

      // Update debate record
      await prisma.aIDebate.update({
        where: { id: debate.id },
        data: {
          status: 'completed',
          predictedOutcome: finalPrediction.outcome,
          probability: finalPrediction.probability * 100,
          confidence: finalPrediction.confidence,
          keyFactors: JSON.stringify(keyFactors),
          sources: JSON.stringify(allSources),
          // Verification not available
          isVerified: false,
        },
      });

      return {
        id: debate.id,
        marketId,
        question,
        source,
        rounds,
        finalPrediction,
        keyFactors,
        sources: allSources,
        isVerified: false,
        status: 'completed',
        createdAt: debate.createdAt.getTime(),
      };
    } catch (error) {
      // Mark debate as failed
      await prisma.aIDebate.update({
        where: { id: debate.id },
        data: { status: 'failed' },
      });
      throw error;
    }
  }

  /**
   * Conduct research for an agent role using 0G Compute
   */
  private async conductResearch(
    question: string,
    role: DebateAgentRole
  ): Promise<ResearchResult> {
    // Try 0G Compute for AI-generated research
    if (isZgComputeConfigured()) {
      try {
        const raw = await zgChatCompletion(
          [{
            role: 'user',
            content: `You are a ${role} research analyst for a prediction market. Research the question: "${question}"

Generate research from the ${role === 'bull' ? 'YES/optimistic' : role === 'bear' ? 'NO/pessimistic' : 'balanced'} perspective.

Respond with ONLY valid JSON:
{"sources":[{"url":"<plausible url>","title":"<title>","snippet":"<1-2 sentences>","relevance":0.85}],"keyPoints":["<point 1>","<point 2>","<point 3>"]}`,
          }],
          { temperature: 0.6, maxTokens: 500 }
        );
        if (raw) {
          const parsed = safeParseAIResponse<{ sources?: any[]; keyPoints?: string[] }>(raw);
          if (parsed) {
            return {
              agentRole: role,
              sources: (parsed.sources || []).map((s: any) => ({
                url: s.url || '',
                title: s.title || '',
                snippet: s.snippet || '',
                relevance: s.relevance || 0.7,
              })),
              keyPoints: parsed.keyPoints || [`${role} analysis point`],
            };
          }
        }
      } catch (err) {
        console.warn(`[AIDebate] 0G research failed for ${role}, using fallback:`, err);
      }
    }

    // Fallback: basic research points
    return {
      agentRole: role,
      sources: [
        { url: '', title: 'Market Analysis', snippet: `Analysis from ${role} perspective on the question.`, relevance: 0.75 },
      ],
      keyPoints: [
        `Key factor supporting ${role} perspective`,
        `Historical precedent from ${role} angle`,
        `Current conditions favoring ${role} position`,
      ],
    };
  }

  /**
   * Generate initial argument from an agent using 0G Compute
   */
  private async generateArgument(
    role: DebateAgentRole,
    question: string,
    research: ResearchResult,
    previousRounds: DebateRound[]
  ): Promise<DebateAgentResponse> {
    const systemPrompt = AGENT_PROMPTS[role];
    const researchContext = research.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n');

    if (isZgComputeConfigured()) {
      try {
        const raw = await zgChatCompletion(
          [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Question: "${question}"

Research findings:
${researchContext}

Provide your initial argument. Respond with ONLY valid JSON:
{"argument":"<your 3-5 sentence argument>","confidence":<50-95>}`,
            },
          ],
          { temperature: 0.7, maxTokens: 600 }
        );
        if (raw) {
          const parsed = safeParseAIResponse<{ argument?: string; confidence?: number }>(raw);
          return {
            argument: parsed?.argument || raw,
            confidence: parsed?.confidence || 70,
            sources: research.sources.map((s) => s.url),
          };
        }
      } catch (err) {
        console.warn(`[AIDebate] 0G argument generation failed for ${role}:`, err);
      }
    }

    // Fallback: template-based
    return {
      argument: this.generateSimulatedArgument(role, question, research),
      confidence: role === 'bull' ? 75 : role === 'bear' ? 70 : 65,
      sources: research.sources.map((s) => s.url),
    };
  }

  /**
   * Generate rebuttal based on previous arguments using 0G Compute
   */
  private async generateRebuttal(
    role: DebateAgentRole,
    question: string,
    previousRounds: DebateRound[]
  ): Promise<DebateAgentResponse> {
    const opposingRole = role === 'bull' ? 'bear' : 'bull';
    const opposingArgs = previousRounds
      .filter((r) => r.agentRole === opposingRole)
      .map((r) => r.argument)
      .join('\n\n');

    if (isZgComputeConfigured() && opposingArgs) {
      try {
        const raw = await zgChatCompletion(
          [
            { role: 'system', content: AGENT_PROMPTS[role] },
            {
              role: 'user',
              content: `Question: "${question}"

Your opponent (${opposingRole}) argued:
${opposingArgs}

Write a rebuttal (3-5 sentences) addressing their specific points. Respond with ONLY valid JSON:
{"argument":"<your rebuttal>","confidence":<50-95>}`,
            },
          ],
          { temperature: 0.7, maxTokens: 500 }
        );
        if (raw) {
          const parsed = safeParseAIResponse<{ argument?: string; confidence?: number }>(raw);
          return {
            argument: parsed?.argument || raw,
            confidence: parsed?.confidence || 70,
            sources: [],
          };
        }
      } catch (err) {
        console.warn(`[AIDebate] 0G rebuttal failed for ${role}:`, err);
      }
    }

    return {
      argument: `[Rebuttal] After considering the ${opposingRole} argument, I maintain that ${
        role === 'bull' ? 'YES' : 'NO'
      } is more likely. The opposing points, while valid, don't account for the core factors driving this outcome.`,
      confidence: 70,
      sources: [],
    };
  }

  /**
   * Synthesize debate and provide final prediction using 0G Compute
   */
  private async synthesizeDebate(
    question: string,
    rounds: DebateRound[]
  ): Promise<DebateAgentResponse> {
    const bullConfidence = this.getAverageConfidence(rounds, 'bull');
    const bearConfidence = this.getAverageConfidence(rounds, 'bear');

    const roundsSummary = rounds
      .map((r) => `[${r.agentRole}] (confidence: ${r.confidence}%): ${r.argument.slice(0, 200)}`)
      .join('\n\n');

    if (isZgComputeConfigured()) {
      try {
        const raw = await zgChatCompletion(
          [
            { role: 'system', content: AGENT_PROMPTS.supervisor },
            {
              role: 'user',
              content: `Question: "${question}"

Debate transcript:
${roundsSummary}

Synthesize the debate. Provide a final probability for YES and confidence level.

Respond with ONLY valid JSON:
{"argument":"<3-5 sentence synthesis with **Probability: XX% YES** and **Confidence: XX%** markers>","confidence":<50-95>}`,
            },
          ],
          { temperature: 0.4, maxTokens: 600 }
        );
        if (raw) {
          const parsed = safeParseAIResponse<{ argument?: string; confidence?: number }>(raw);
          return {
            argument: parsed?.argument || raw,
            confidence: parsed?.confidence || 70,
            sources: [],
          };
        }
      } catch (err) {
        console.warn('[AIDebate] 0G synthesis failed:', err);
      }
    }

    // Fallback: math-based synthesis
    const yesProbability = bullConfidence / (bullConfidence + bearConfidence);
    const confidence = Math.abs(bullConfidence - bearConfidence) + 50;

    return {
      argument: `After analyzing all arguments, my final assessment is:\n\n**Probability: ${(yesProbability * 100).toFixed(1)}% YES**\n**Confidence: ${confidence.toFixed(0)}%**\n\nFinal recommendation: ${yesProbability > 0.5 ? 'Lean YES' : 'Lean NO'} with ${confidence > 70 ? 'high' : 'moderate'} confidence.`,
      confidence,
      sources: [],
    };
  }

  /**
   * Save debate round to database
   */
  private async saveRound(
    debateId: string,
    roundNumber: number,
    agentRole: DebateAgentRole,
    response: DebateAgentResponse
  ): Promise<DebateRound> {
    const round = await prisma.aIDebateRound.create({
      data: {
        debateId,
        roundNumber,
        agentRole,
        argument: response.argument,
        sources: JSON.stringify(response.sources),
        confidence: response.confidence,
      },
    });

    return {
      id: round.id,
      roundNumber: round.roundNumber,
      agentRole: round.agentRole as DebateAgentRole,
      argument: round.argument,
      sources: response.sources,
      confidence: round.confidence,
      timestamp: round.timestamp.getTime(),
    };
  }

  /**
   * Extract prediction from supervisor synthesis
   */
  private extractPrediction(synthesis: string): {
    outcome: 'yes' | 'no';
    probability: number;
    confidence: number;
  } {
    // Extract probability from synthesis text
    const probMatch = synthesis.match(/(\d+(?:\.\d+)?)\s*%\s*YES/i);
    const probability = probMatch ? parseFloat(probMatch[1]) / 100 : 0.5;

    const confMatch = synthesis.match(/Confidence:\s*(\d+(?:\.\d+)?)\s*%/i);
    const confidence = confMatch ? parseFloat(confMatch[1]) : 50;

    return {
      outcome: probability > 0.5 ? 'yes' : 'no',
      probability,
      confidence,
    };
  }

  /**
   * Extract key factors from debate rounds
   */
  private extractKeyFactors(rounds: DebateRound[]): string[] {
    // Extract distinct key points from round arguments
    const factors: string[] = [];
    for (const r of rounds) {
      // Pull first sentence from each argument as a key factor
      const firstSentence = r.argument.split(/[.!?]/)[0]?.trim();
      if (firstSentence && firstSentence.length > 20 && firstSentence.length < 200) {
        factors.push(firstSentence);
      }
    }
    // Deduplicate and limit
    return [...new Set(factors)].slice(0, 5);
  }

  /**
   * Get average confidence for a role across rounds
   */
  private getAverageConfidence(
    rounds: DebateRound[],
    role: DebateAgentRole
  ): number {
    const roleRounds = rounds.filter((r) => r.agentRole === role);
    if (roleRounds.length === 0) return 50;

    const sum = roleRounds.reduce((acc, r) => acc + r.confidence, 0);
    return sum / roleRounds.length;
  }

  /**
   * Generate simulated argument (placeholder for AI)
   */
  private generateSimulatedArgument(
    role: DebateAgentRole,
    question: string,
    research: ResearchResult
  ): string {
    const templates = {
      bull: `As the Bull Agent, I argue strongly for YES on "${question}".

Based on my research:
${research.keyPoints.map((p) => `- ${p}`).join('\n')}

The evidence clearly supports a YES outcome because of recent positive developments and favorable historical patterns. Market sentiment and expert analysis both point toward this outcome materializing.

**My confidence: ${70 + Math.floor(Math.random() * 20)}%**`,

      bear: `As the Bear Agent, I argue for NO on "${question}".

Based on my research:
${research.keyPoints.map((p) => `- ${p}`).join('\n')}

There are significant factors that could prevent a YES outcome. Historical precedent shows similar predictions have failed, and current uncertainties present substantial risk.

**My confidence: ${65 + Math.floor(Math.random() * 20)}%**`,

      neutral: `As the Neutral Agent, I provide balanced analysis on "${question}".

**For YES:**
${research.keyPoints[0]}

**For NO:**
${research.keyPoints[1]}

**Key Uncertainties:**
${research.keyPoints[2]}

Both sides present valid arguments. The outcome will likely depend on factors that remain uncertain at this time.

**Estimated probability range: 40-60% YES**`,

      supervisor: 'Supervisor synthesis is generated separately.',
    };

    return templates[role];
  }

  // ============================================
  // DATABASE QUERIES
  // ============================================

  /**
   * Get debate by ID
   */
  async getDebate(debateId: string): Promise<DebateResult | null> {
    const debate = await prisma.aIDebate.findUnique({
      where: { id: debateId },
      include: { rounds: true },
    });

    if (!debate) return null;

    return this.formatDebateResult(debate);
  }

  /**
   * Get debate history for a market
   */
  async getDebateHistory(marketId: string): Promise<DebateResult[]> {
    const debates = await prisma.aIDebate.findMany({
      where: { marketId },
      include: { rounds: true },
      orderBy: { createdAt: 'desc' },
    });

    return debates.map((d) => this.formatDebateResult(d));
  }

  /**
   * Format database debate to DebateResult
   */
  private formatDebateResult(debate: {
    id: string;
    marketId: string;
    question: string;
    source: string;
    predictedOutcome: string | null;
    probability: number | null;
    confidence: number | null;
    keyFactors: string | null;
    sources: string | null;
    inputHash: string | null;
    outputHash: string | null;
    providerAddress: string | null;
    isVerified: boolean;
    status: string;
    createdAt: Date;
    rounds: Array<{
      id: string;
      roundNumber: number;
      agentRole: string;
      argument: string;
      sources: string | null;
      confidence: number;
      timestamp: Date;
    }>;
  }): DebateResult {
    return {
      id: debate.id,
      marketId: debate.marketId,
      question: debate.question,
      source: debate.source as MarketSource,
      rounds: debate.rounds.map((r) => ({
        id: r.id,
        roundNumber: r.roundNumber,
        agentRole: r.agentRole as DebateAgentRole,
        argument: r.argument,
        sources: r.sources ? JSON.parse(r.sources) : [],
        confidence: r.confidence,
        timestamp: r.timestamp.getTime(),
      })),
      finalPrediction: {
        outcome: (debate.predictedOutcome || 'yes') as 'yes' | 'no',
        probability: (debate.probability || 50) / 100,
        confidence: debate.confidence || 50,
      },
      keyFactors: debate.keyFactors ? JSON.parse(debate.keyFactors) : [],
      sources: debate.sources ? JSON.parse(debate.sources) : [],
      proof: debate.inputHash
        ? {
            inputHash: debate.inputHash,
            outputHash: debate.outputHash || '',
            providerAddress: debate.providerAddress || '',
          }
        : undefined,
      isVerified: debate.isVerified,
      status: debate.status as 'pending' | 'in_progress' | 'completed' | 'failed',
      createdAt: debate.createdAt.getTime(),
    };
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const aiDebateService = new AIDebateService();
export default aiDebateService;
