import * as React from "react";

const Tabs = ({ defaultValue, children, className, ...props }: {
  defaultValue?: string;
  children: React.ReactNode;
  className?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}) => {
  const [activeTab, setActiveTab] = React.useState(defaultValue || "");

  const value = props.value || activeTab;
  const onValueChange = props.onValueChange || setActiveTab;

  return (
    <div className={className} {...props}>
      <TabsContext.Provider value={{ value, onValueChange }}>
        {children}
      </TabsContext.Provider>
    </div>
  );
};

const TabsContext = React.createContext<{
  value: string;
  onValueChange: (value: string) => void;
}>({
  value: "",
  onValueChange: () => {}
});

const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={`inline-flex h-12 items-center justify-center rounded-lg arcade-border bg-stone-900 p-1 text-yellow-400 ${className}`}
    {...props}
  />
));
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }
>(({ className, value, ...props }, ref) => {
  const { value: selectedValue, onValueChange } = React.useContext(TabsContext);
  
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-6 py-3 text-sm font-bold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 arcade-glow ${
        selectedValue === value
          ? "bg-gradient-to-r from-yellow-600 to-yellow-500 text-black shadow-lg border-2 border-yellow-400"
          : "text-yellow-400 hover:bg-yellow-600/20 hover:text-yellow-300 border-2 border-transparent"
      } ${className}`}
      onClick={() => onValueChange(value)}
      style={{fontFamily: 'Press Start 2P, monospace'}}
      {...props}
    />
  );
});
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, value, ...props }, ref) => {
  const { value: selectedValue } = React.useContext(TabsContext);
  
  if (selectedValue !== value) return null;
  
  return (
    <div
      ref={ref}
      className={`mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}
      {...props}
    />
  );
});
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
