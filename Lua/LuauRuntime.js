import {
    LuauState
} from "https://cdn.jsdelivr.net/gh/xNasuni/luau-web@main/dist/luauweb.min.js";

let state = null;

async function createState(outputElement) {
    state = await LuauState.createAsync();

    state.env.set("print", (...args) => {
        const line = args.map(value => String(value)).join("\t");

        if (outputElement) {
            outputElement.textContent += line + "\n";
        }

        console.log("[Luau]", line);
    }, true);

    return state;
}

export async function runLuau(code, outputElement = null) {
    if (outputElement) {
        outputElement.textContent = "";
    }

    try {
        const luauState = state ?? await createState(outputElement);

        const run = luauState.loadstring(
            code,
            "main.luau",
            true
        );

        await run();

        return true;
    } catch (error) {
        const message = error instanceof Error
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

export async function resetLuau(outputElement = null) {
    state = null;

    if (outputElement) {
        outputElement.textContent = "";
    }

    return createState(outputElement);
}
