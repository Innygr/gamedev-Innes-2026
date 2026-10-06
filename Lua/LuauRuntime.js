import { LuauState } from
"https://cdn.jsdelivr.net/gh/xNasuni/luau-web@main/dist/luauweb.min.js";

/*

* Shared Luau runtime for the GameDev Innes
* Lua Sub-Class.
*
* This runs actual Luau through WebAssembly.
  */

export async function runLuau(code, outputElement) {

if (!outputElement) {
throw new Error("Luau output element was not found.");
}

outputElement.textContent =
"Loading Luau runtime...";

try {

```
/* Create a fresh Luau state */

const state =
  await LuauState.createAsync();


/*
 * Replace print() with a browser
 * output function.
 */

state.env.set(
  "print",
  (...args) => {

    const line = args
      .map(value => String(value))
      .join("\t");

    outputElement.textContent +=
      line + "\n";

  },
  true
);


outputElement.textContent = "";


/*
 * Compile the Luau code.
 */

const result =
  state.loadstring(
    code,
    "main.luau",
    true
  );


/*
 * loadstring returns the compiled
 * result directly in luau-web.
 *
 * Do not call the result as a
 * JavaScript function.
 */

if (result instanceof Error) {
  throw result;
}


/*
 * Execute the loaded Luau chunk
 * through the Luau state.
 */

state.call(
  result
);
```

} catch (error) {

```
outputElement.textContent =
  "ERROR:\n" +
  String(error);

console.error(
  "Luau execution error:",
  error
);
```

}

}
