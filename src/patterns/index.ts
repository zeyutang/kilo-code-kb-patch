// Every reviewed core pattern, one entry per Kilo file it patches.

import type { FilePatches } from "../core/features";
import { KILOCLAW_PATCHES } from "./kiloclaw";
import { WEBVIEW_PATCHES } from "./webview";

export const PATCHES: FilePatches[] = [WEBVIEW_PATCHES, KILOCLAW_PATCHES];
