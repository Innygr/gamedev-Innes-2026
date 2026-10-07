```js
// LuauRuntime.js
// Shared browser runtime for the Lua subclass.
//
// Uses luau-web directly from its browser CDN build.

import {
    LuauState
} from "https://cdn.jsdelivr.net/gh/xNasuni/luau-web@main/dist/luauweb.min.js";


let state = null;


/**
 * Create the Luau VM.
 */
async function createState(outputElement) {
    state = await LuauState.createAsync();

    // Send Luau print() output to the webpage.
    state.env.set("print", (...args) => {
        const line = args
            .map(value => String(value))
            .join("\t");

        if (outputElement) {
            outputElement.textContent += line + "\n";
            outputElement.scrollTop = outputElement.scrollHeight;
        }

        console.log("[Luau]", line);
    }, true);

    return state;
}


/**
 * Run Luau code.
 *
 * @param {string} code
 * @param {HTMLElement|null} outputElement
 */
export async function runLuau(code, outputElement = null) {
    if (outputElement) {
        outputElement.textContent = "";
    }

    try {
        const luauState = state ?? await createState(outputElement);

        // loadstring() returns the executable Luau function.
        const run = luauState.loadstring(
            code,
            "main.luau",
            true
        );

        // IMPORTANT:
        // luau-web 1.4 executes the returned function directly.
        await run();

        return true;

    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : String(error);

        if (outputElement) {
            outputElement.textContent +=
                "\n[Luau Error]\n" + message;
        }

        console.error("Luau Error:", error);

        return false;
    }
}


/**
 * Reset the Luau VM.
 *
 * Useful if an assignment needs a completely
 * fresh environment.
 */
export async function resetLuau(outputElement = null) {
    state = null;

    if (outputElement) {
        outputElement.textContent = "";
    }

    return createState(outputElement);
}
```

Then your HTML should import it like this:

```html
<script type="module">
    import { runLuau } from "./LuauRuntime.js";

    const code = `
print("Hello from Luau!")

local name = "Inny"
local number = 10

print("Name:", name)
print("Number:", number)

if number > 5 then
    print("Number is greater than 5!")
else
    print("Number is 5 or less.")
end

for i = 1, 5 do
    print("Loop:", i)
end

print("Runtime test complete!")
`;

    async function runTest() {
        await runLuau(
            code,
            document.getElementById("output")
        );
    }

    document
        .getElementById("runButton")
        .addEventListener("click", runTest);
</script>
```

And the corresponding HTML elements:

```html
<button id="runButton">Run Luau</button>

<pre id="output"></pre>
```

### What was actually broken

The old version effectively did:

```js
const result = state.loadstring(...);
state.call(result);
```

That isn't the API pattern we're supposed to use here.

The working pattern is:

```js
const run = state.loadstring(code, "main.luau", true);
await run();
```

`luau-web` 1.4 specifically documents `loadstring()` as producing a callable function, and its 1.4 release also changed JS→Luau calls to require awaiting their return values.

**So don't change anything else yet.** Get this runtime working with your existing `test.html` first; then we can add the `displayTable()` bridge for L1 properly.
