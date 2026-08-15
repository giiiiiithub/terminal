/** Locale dictionaries for the dsh-terminal namespace. zh is the source of truth. */

export interface LocaleDict {
  [key: string]: string;
}

export const zh: LocaleDict = {
  "panel.title": "终端",
  "tab.new": "新建终端",
  "tab.close": "关闭终端",
  "action.clear": "清屏",
  "action.copy": "复制选中",
  "action.paste": "粘贴",
  "action.shell": "Shell",
  "action.cwd": "目录",
  "action.float": "浮动",
  "action.dock": "停靠",
  "action.minimize": "最小化",
  "action.maximize": "最大化",
  "action.restore": "还原",
  "action.close": "关闭",
  "action.resizeHint": "拖动上边缘调整高度",
  "state.opening": "正在启动…",
  "state.error": "终端错误：{message}",
  "state.empty": "没有会话 — 点击 + 新建终端",
  "state.exited": "进程已退出（代码 {code}）"
};

export const en: LocaleDict = {
  "panel.title": "Terminal",
  "tab.new": "New terminal",
  "tab.close": "Close terminal",
  "action.clear": "Clear",
  "action.copy": "Copy selection",
  "action.paste": "Paste",
  "action.shell": "Shell",
  "action.cwd": "Directory",
  "action.float": "Float",
  "action.dock": "Dock",
  "action.minimize": "Minimize",
  "action.maximize": "Maximize",
  "action.restore": "Restore",
  "action.close": "Close",
  "action.resizeHint": "Drag the top edge to resize",
  "state.opening": "Starting…",
  "state.error": "Terminal error: {message}",
  "state.empty": "No sessions — click + to create one",
  "state.exited": "Process exited (code {code})"
};
