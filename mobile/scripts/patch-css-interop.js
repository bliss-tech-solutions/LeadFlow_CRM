// Safely patch react-native-css-interop so stringify never throws on getters like LinkingContext.options
const fs = require("fs");
const path = require("path");

const target = path.join(__dirname, "..", "node_modules", "react-native-css-interop", "dist", "runtime", "native", "render-component.js");

if (fs.existsSync(target)) {
  let content = fs.readFileSync(target, "utf8");
  if (!content.includes("propsStr = \"[props omitted]\"")) {
    const unpatched = `function printUpgradeWarning(warning, originalProps) {
    console.log(\`CssInterop upgrade warning.\\n\\n\${warning}.\\n\\nThis warning was caused by a component with the props:\\n\${stringify(originalProps)}\\n\\nIf adding or removing sibling components caused this warning you should add a unique "key" prop to your components. https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key\\n\`);
}
function stringify(object) {
    const seen = new WeakSet();
    return JSON.stringify(object, function replace(_, value) {
        if (!(value !== null && typeof value === "object")) {
            return value;
        }
        if (seen.has(value)) {
            return "[Circular]";
        }
        seen.add(value);
        const newValue = Array.isArray(value) ? [] : {};
        for (const entry of Object.entries(value)) {
            newValue[entry[0]] = replace(entry[0], entry[1]);
        }
        seen.delete(value);
        return newValue;
    }, 2);
}`;

    const patched = `function printUpgradeWarning(warning, originalProps) {
    let propsStr = "";
    try {
        propsStr = stringify(originalProps);
    } catch {
        propsStr = "[props omitted]";
    }
    console.warn(\`CssInterop upgrade warning.\\n\\n\${warning}.\\n\\nThis warning was caused by a component with the props:\\n\${propsStr}\\n\\nIf adding or removing sibling components caused this warning you should add a unique "key" prop to your components. https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key\\n\`);
}
function stringify(object) {
    try {
        const seen = new WeakSet();
        return JSON.stringify(object, function replace(k, value) {
            if (!(value !== null && typeof value === "object")) {
                return value;
            }
            if (seen.has(value)) {
                return "[Circular]";
            }
            seen.add(value);
            if (value.$$typeof || value._context || value._currentValue !== undefined) {
                return "[ReactNode]";
            }
            const newValue = Array.isArray(value) ? [] : {};
            try {
                for (const key of Object.keys(value)) {
                    try {
                        const descriptor = Object.getOwnPropertyDescriptor(value, key);
                        if (descriptor && descriptor.get && !descriptor.set) continue;
                        newValue[key] = replace(key, value[key]);
                    } catch {
                        // ignore getters that throw like LinkingContext.options
                    }
                }
            } catch {
                return "[Object]";
            }
            seen.delete(value);
            return newValue;
        }, 2);
    } catch {
        return "[Object]";
    }
}`;

    if (content.includes(unpatched)) {
      content = content.replace(unpatched, patched);
      fs.writeFileSync(target, content, "utf8");
      console.log("[patch-css-interop] Successfully patched react-native-css-interop");
    }
  }
}
