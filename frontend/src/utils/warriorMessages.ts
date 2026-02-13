// Medieval-themed messages for warrior assistant
export interface WarriorMessage {
  id: string;
  text: string;
  duration?: number;
  type?: 'info' | 'success' | 'warning' | 'error';
}

export const WARRIOR_MESSAGES = {
  // Welcome messages
  WELCOME: [
    "WELCOME CHIEF!",
    "Hail and well met, Chief!",
    "The realm awaits your command, Chief!",
    "Greetings, mighty Chief of the Clans!"
  ],

  // WarriorsMinter Page Processes
  WARRIORS_MINTER: {
    // Page Load
    PAGE_LOAD: [
      "Chief! Ready to forge legendary warriors? The anvils are hot and the magic flows strong!",
      "The warrior forges await your command, Chief! Shall we craft champions today?",
      "By the ancient scrolls! This is where legends are born, Chief!"
    ],

    // Form Filling
    FORM_START: [
      "Ah! I see you're crafting a new champion, Chief. Every detail matters in the forging!",
      "A warrior's tale begins with their name, Chief. Choose wisely - it shall echo through the ages!",
      "The scribes are ready, Chief! Tell us the legend of your new warrior."
    ],

    // Image Upload
    IMAGE_UPLOAD_START: [
      "A portrait of your warrior! The court painters are standing by, Chief.",
      "Choose your champion's visage wisely, Chief - for enemies shall tremble at its sight!",
      "Every legendary warrior needs a fearsome portrait, Chief!"
    ],

    IMAGE_UPLOAD_SUCCESS: [
      "Magnificent portrait, Chief! Your warrior's image shall strike fear into enemies!",
      "The painters have captured their essence perfectly, Chief!",
      "A visage worthy of legends! Well chosen, Chief!"
    ],

    // Form Completion
    FORM_COMPLETE: [
      "Your warrior's tale is complete, Chief! Ready to breathe life into this legend?",
      "All preparations are finished, Chief! Shall we forge this champion into reality?",
      "The ritual is prepared, Chief! One word from you and your warrior shall rise!"
    ],

    // Minting Process
    MINTING_START: [
      "The forge fires blaze, Chief! Your warrior is being forged in the ancient ways!",
      "By hammer and anvil! The creation ritual has begun, Chief!",
      "The mystic energies swirl, Chief! Your champion emerges from the ethereal realm!"
    ],

    MINTING_UPLOADING: [
      "The scribes record your warrior's essence in the eternal chronicles, Chief!",
      "Your champion's soul is being bound to the mystical storage vaults, Chief!",
      "The ancient archives accept your warrior's legend, Chief!"
    ],

    MINTING_SUCCESS: [
      "HUZZAH! Your warrior lives, Chief! A new legend joins your mighty clan!",
      "Victory! Your champion has been forged successfully, Chief!",
      "The realm celebrates! Another legendary warrior serves under your banner, Chief!"
    ],

    MINTING_ERROR: [
      "Blast these cursed enchantments! The forging failed, Chief. Shall we try the ritual again?",
      "The mystical energies resist us, Chief! Perhaps the gods demand a different approach?",
      "Confound it! The warrior's essence slipped away, Chief. Fear not - we'll capture it next time!"
    ],

    // AI Generation
    AI_GENERATION_START: [
      "The ancient oracles stir, Chief! Let them divine your warrior's attributes!",
      "By the power of the mystic seers! Your warrior's destiny is being revealed, Chief!",
      "The crystal balls swirl with visions, Chief! Your champion's traits emerge from the mists!"
    ],

    AI_GENERATION_SUCCESS: [
      "The oracles have spoken, Chief! Behold your warrior's divinely crafted attributes!",
      "The seers' visions are clear, Chief! Your champion's destiny is written in the stars!",
      "Magnificent! The ancient wisdom has shaped your warrior perfectly, Chief!"
    ],

    // Managing Warriors
    MANAGE_WARRIORS: [
      "Your warband assembles, Chief! Which champion requires your attention?",
      "Behold your mighty warriors, Chief! Each one ready to serve the clan!",
      "Your champions await orders, Chief! Their loyalty knows no bounds!"
    ],

    // Warrior Activation
    ACTIVATION_START: [
      "The ritual of awakening begins, Chief! Your warrior's true power shall be unlocked!",
      "Ancient magics flow through your champion, Chief! They shall gain mystical abilities!",
      "By the old ways! Your warrior's combat prowess is being enhanced, Chief!"
    ],

    ACTIVATION_SUCCESS: [
      "GLORIOUS! Your warrior has awakened, Chief! They now possess legendary combat skills!",
      "The awakening is complete, Chief! Your champion's battle prowess has been revealed!",
      "Success! Your warrior now channels the ancient fighting arts, Chief!"
    ],

    // Warrior Promotion
    PROMOTION_AVAILABLE: [
      "Chief! One of your warriors has earned great honor and is ready for promotion!",
      "A champion has proven their worth, Chief! They deserve a higher rank!",
      "Glory to the clan! Your warrior's deeds qualify them for advancement, Chief!"
    ],

    PROMOTION_START: [
      "The ceremony of elevation begins, Chief! Your warrior shall rise in rank!",
      "By crown and scepter! Your champion's promotion ritual commences, Chief!",
      "Rise, noble warrior! Your Chief grants you higher standing in the clan!"
    ],

    PROMOTION_SUCCESS: [
      "HAIL THE PROMOTED WARRIOR! Your champion now bears a higher rank, Chief!",
      "The ceremony concludes! Your warrior's new status is recognized across the realm, Chief!",
      "Victory! Your champion's advancement brings honor to the entire clan, Chief!"
    ],

    // Form Validation Messages
    MISSING_NAME: [
      "A warrior without a name is like a sword without a blade, Chief!",
      "Every legend needs a name, Chief! What shall this champion be called?",
      "Name your warrior, Chief! Their legacy depends upon it!"
    ],

    MISSING_DETAILS: [
      "More details are needed, Chief! A warrior's story must be complete.",
      "The scribes require more information, Chief! Fill all the sacred scrolls!",
      "Every field must be completed, Chief! The ritual demands thoroughness!"
    ],

    // Loading States
    LOADING_WARRIORS: [
      "Summoning your warriors from the ethereal realm, Chief...",
      "The champions answer your call, Chief! They approach from distant lands...",
      "Your warband assembles, Chief! Patience while they gather..."
    ],

    // Error States
    CONNECTION_ERROR: [
      "The mystical connection wavers, Chief! Check your ethereal links!",
      "The arcane networks resist us, Chief! Ensure your connections are strong!",
      "Blast! The magical pathways are blocked, Chief!"
    ]
  },

  // Arena Page Processes
  ARENA: {
    PAGE_LOAD: [
      "Welcome to the grand Colosseum, Chief! Where legends are born and warriors prove their worth!",
      "Hark! The Arena awaits thy command! Choose thy champions wisely, for glory eternal beckons!",
      "Behold the battlefield of legends! Here, only the strongest survive to claim victory, Chief!",
      "The roar of the crowd echoes through eternity! Prepare thy warriors for the ultimate test!"
    ],
    ARENA_INITIALIZE: [
      "By the ancient gods! A new Arena is being forged in the fires of battle! Witness its birth, Chief!",
      "Hark! The sacred grounds are being consecrated for combat! Soon warriors shall spill blood upon it!",
      "Behold! A fresh battlefield emerges from the void! May it witness countless glorious battles!"
    ],
    GAME_START: [
      "Let the games begin! May the strongest warrior claim victory and eternal glory, Chief!",
      "The battle horn sounds! Warriors, show thy mettle and fight for honor and crown!",
      "By steel and strategy! Let this clash echo through the halls of legend! Fight well!"
    ],
    BETTING_PLACED: [
      "A wise wager, Chief! Thy CRwN shall multiply if thy chosen champion proves victorious!",
      "Gold flows like rivers! Thy bet is placed upon the altar of chance and skill!",
      "Excellent choice, my lord! Fortune favors the bold who back true warriors!"
    ],
    INFLUENCE_CAST: [
      "The spirits heed thy call! Thy champion grows stronger with divine favor!",
      "Mystical energies surge! Thy warrior's prowess increases through thy will, Chief!",
      "By ancient magic! Thy influence tips the scales of battle in thy favor!"
    ],
    DEFLUENCE_CAST: [
      "Dark magic flows! Thy enemy's strength wanes before thy strategic cunning!",
      "Clever tactics, Chief! Weaken thy foe while thy champion stands tall!",
      "The curse takes hold! Watch as thy opponent's power diminishes!"
    ],
    ROUND_COMPLETE: [
      "Another round concludes! The battle grows more intense with each clash!",
      "Blood and steel dance together! See how the tide of battle shifts!",
      "Each strike tells a story! Watch as destiny unfolds before thine eyes!"
    ],
    BATTLE_WON: [
      "VICTORY IS THINE! Thy champion stands triumphant over the fallen foe!",
      "Glory eternal! Another victory added to thy legendary record, Chief!",
      "By sword and shield! Thy warrior proves superior in combat once again!"
    ],
    BATTLE_LOST: [
      "Defeat teaches wisdom, Chief! Even the greatest warriors face setbacks!",
      "Fear not this loss! Every fallen champion rises stronger than before!",
      "The wheel of fortune turns! Tomorrow brings new chances for glory!"
    ],
    WINNINGS_CLAIMED: [
      "Thy coffers overflow with well-earned gold! Victory brings sweet rewards!",
      "CRwN flows into thy treasury! Proof that backing winners pays handsomely!",
      "The spoils of war are thine! Let this victory fund future conquests!"
    ]
  },

  // CRwN Token Operations (Home Page)
  CRWN_TOKEN: {
    MINT_START: [
      "By the royal mint! Thy FLOW shall be transformed into precious CRwN tokens!",
      "The alchemical process begins! Watch as thy currency becomes battle-ready CRwN!",
      "Hark! The forges burn bright as thy FLOW transforms into crown currency!"
    ],
    MINT_SUCCESS: [
      "Behold! Fresh CRwN tokens gleam in thy treasury! Ready for battle and wagers!",
      "The minting ritual is complete! Thy wealth has been transmuted into warrior currency!",
      "Excellent! New CRwN tokens await thy command in future battles, Chief!"
    ],
    BURN_START: [
      "The fires of conversion ignite! Thy CRwN tokens shall return to pure FLOW!",
      "By ancient alchemy! Thy battle currency transforms back to base FLOW!",
      "The reverse transmutation begins! CRwN becomes FLOW once more!"
    ],
    BURN_SUCCESS: [
      "The ritual is complete! Thy CRwN has been converted back to FLOW currency!",
      "Successful transformation! Thy tokens have returned to their original form!",
      "Well done! Thy FLOW has been reclaimed from the warrior's treasury!"
    ],
    TRANSACTION_PENDING: [
      "The blockchain spirits work their magic! Patience, Chief, thy transaction processes!",
      "The mystical ledger updates! Soon thy changes shall be reflected!",
      "By digital sorcery! The network confirms thy will across the realm!"
    ]
  }
};

// Function to get random message from array
export const getRandomMessage = (messages: string[]): string => {
  return messages[Math.floor(Math.random() * messages.length)];
};

// Function to get message by context
export const getWarriorMessage = (context: string, subContext?: string): WarriorMessage => {
  const messageKey = subContext ? 
    WARRIOR_MESSAGES.WARRIORS_MINTER[context as keyof typeof WARRIOR_MESSAGES.WARRIORS_MINTER] :
    WARRIOR_MESSAGES[context as keyof typeof WARRIOR_MESSAGES];
  
  if (Array.isArray(messageKey)) {
    return {
      id: `${context}_${subContext || ''}_${Date.now()}`,
      text: getRandomMessage(messageKey),
      duration: 3500 // Changed from 4000 to 3500 (3.5 seconds)
    };
  }
  
  return {
    id: `fallback_${Date.now()}`,
    text: "Greetings, Chief! Your warrior assistant stands ready!",
    duration: 3500 // Changed from 4000 to 3500 (3.5 seconds)
  };
};
