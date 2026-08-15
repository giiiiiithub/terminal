import { t as DESCRIPTORS } from "./descriptors-DBmAMUTQ.mjs";
//#region src/remote.ts
/**
* Client typert contribution: mounted by the browser plugin through
* ctx.remote.$mount(contribution). The descriptors mirror the host manifest,
* so both ends validate the same wire.
*/
const TYPERT_REMOTE = {
	package: "dsh-terminal",
	descriptors: DESCRIPTORS
};
//#endregion
export { TYPERT_REMOTE, TYPERT_REMOTE as default };
