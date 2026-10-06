import {
    LuauState,
    InternalLuauWasmModule
} from "https://cdn.jsdelivr.net/gh/xNasuni/luau-web@1.4/dist/luauweb.min.js";

export async function runLuau(code, output) {
    return new Promise((resolve, reject) => {

        InternalLuauWasmModule.onRuntimeInitialized = () => {

            try {
                const state = new LuauState();

                state.loadstring(
                    code,
                    "main.luau",
                    true
                )();

                resolve();

            } catch (error) {
                reject(error);
            }

        };
    });
}
