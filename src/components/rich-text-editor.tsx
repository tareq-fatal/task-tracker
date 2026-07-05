"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
} from "react";
import { EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import { mergeAttributes } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import type { SuggestionOptions, SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Code as CodeIcon,
  Link2,
  List as ListIcon,
  ListOrdered,
  Quote as QuoteIcon,
  Image as ImageIcon,
  Smile,
  Loader2,
  Check,
  Trash2,
} from "lucide-react";
import {
  searchMentionUsersAction,
  searchTaskRefsAction,
  uploadEditorImageAction,
} from "@/actions/editor";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Suggestion dropdown (plain DOM — no positioning library needed)     */
/* ------------------------------------------------------------------ */

type SuggestionItem = { id: string; label: string; sub?: string };

/**
 * Renders the @/# autocomplete as a fixed-position list under the caret.
 * Plain DOM instead of a React portal: the suggestion plugin lifecycle
 * (start/update/keydown/exit) maps 1:1 onto imperative updates.
 */
function suggestionRenderer(): ReturnType<NonNullable<SuggestionOptions["render"]>> {
  let el: HTMLDivElement | null = null;
  let items: SuggestionItem[] = [];
  let selected = 0;
  let command: (item: SuggestionItem) => void = () => {};

  function renderList() {
    if (!el) return;
    el.innerHTML = "";
    if (items.length === 0) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    items.forEach((item, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = cn("rte-suggest-item", i === selected && "is-selected");
      const label = document.createElement("span");
      label.className = "truncate";
      label.textContent = item.label;
      btn.appendChild(label);
      if (item.sub) {
        const sub = document.createElement("span");
        sub.className = "rte-suggest-sub";
        sub.textContent = item.sub;
        btn.appendChild(sub);
      }
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep editor focus
        command(item);
      });
      el!.appendChild(btn);
    });
    el.children[selected]?.scrollIntoView({ block: "nearest" });
  }

  function position(clientRect: (() => DOMRect | null) | null | undefined) {
    if (!el || !clientRect) return;
    const rect = clientRect();
    if (!rect) return;
    const width = 288;
    const left = Math.min(rect.left, window.innerWidth - width - 8);
    el.style.left = `${Math.max(8, left)}px`;
    el.style.top = `${rect.bottom + 4}px`;
  }

  return {
    onStart(props: SuggestionProps<SuggestionItem>) {
      el = document.createElement("div");
      el.className = "rte-suggest";
      document.body.appendChild(el);
      items = props.items;
      command = props.command;
      selected = 0;
      position(props.clientRect);
      renderList();
    },
    onUpdate(props: SuggestionProps<SuggestionItem>) {
      items = props.items;
      command = props.command;
      selected = Math.min(selected, Math.max(0, items.length - 1));
      position(props.clientRect);
      renderList();
    },
    onKeyDown(props: SuggestionKeyDownProps) {
      if (!items.length) return false;
      if (props.event.key === "ArrowDown") {
        selected = (selected + 1) % items.length;
        renderList();
        return true;
      }
      if (props.event.key === "ArrowUp") {
        selected = (selected - 1 + items.length) % items.length;
        renderList();
        return true;
      }
      if (props.event.key === "Enter" || props.event.key === "Tab") {
        command(items[selected]);
        return true;
      }
      if (props.event.key === "Escape") {
        el?.remove();
        el = null;
        return true;
      }
      return false;
    },
    onExit() {
      el?.remove();
      el = null;
    },
  };
}

function suggestion(
  nodeName: string,
  char: string,
  fetchItems: (query: string) => Promise<SuggestionItem[]>
): Omit<SuggestionOptions<SuggestionItem>, "editor"> {
  return {
    char,
    pluginKey: new PluginKey(`${nodeName}Suggestion`),
    allowSpaces: false,
    items: async ({ query }) => {
      try {
        return await fetchItems(query);
      } catch {
        return []; // a failed lookup must never break the suggestion plugin
      }
    },
    command: ({ editor, range, props }) => {
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          { type: nodeName, attrs: { id: props.id, label: props.label } },
          { type: "text", text: " " },
        ])
        .run();
    },
    render: suggestionRenderer,
  };
}

/* ------------------------------------------------------------------ */
/* Mention nodes: @user (span.mention) and #task (a.task-ref)          */
/* ------------------------------------------------------------------ */

const UserMention = Mention.extend({
  name: "userMention",
  parseHTML() {
    return [{ tag: 'span[data-type="mention"]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "mention", class: "mention" }),
      `@${node.attrs.label ?? node.attrs.id}`,
    ];
  },
  renderText({ node }) {
    return `@${node.attrs.id ?? node.attrs.label}`;
  },
});

const TaskRef = Mention.extend({
  name: "taskRef",
  parseHTML() {
    return [{ tag: 'a[data-type="taskRef"]' }, { tag: 'span[data-type="taskRef"]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-type": "taskRef",
        class: "task-ref",
        href: `/tasks/${node.attrs.id}`,
      }),
      `#${node.attrs.label ?? node.attrs.id}`,
    ];
  },
  renderText({ node }) {
    return `#${node.attrs.label ?? node.attrs.id}`;
  },
});

/* ------------------------------------------------------------------ */
/* Emoji picker (small static set — no extra dependency)               */
/* ------------------------------------------------------------------ */

const EMOJIS =
  "😀 😁 😂 🤣 😊 🙂 😉 😍 🥰 😘 😎 🤩 🥳 😅 😇 🤔 😐 😴 😮 😢 😭 😤 😡 🤯 🥺 😬 🙄 👍 👎 👌 ✌️ 🤞 🤘 👏 🙌 🤝 🙏 💪 🫶 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 💯 ✨ ⭐ 🌟 🔥 💥 ✅ ❌ ⚠️ ❓ ❗ 💡 📌 📎 🔗 📅 ⏰ 🚀 🎉 🎊 🎁 🏆 🥇 🎯 📈 📉 💰 🐛 🔧 🔨 🛠️ ⚙️ 🧪 🔒 🔑 👀 🧠 ☕ 🍕 🎮 🌈 ☀️ 🌙 ⚡ ❄️ 🤖 💬 📝 📊 🗓️ 🏁 🚧 🆗 🆕 🔔".split(" ");

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

export type RichTextEditorHandle = {
  /** Reset to an empty document (e.g. after a comment is submitted). */
  clear: () => void;
};

const UPLOAD_ERRORS: Record<string, string> = {
  TOO_LARGE: "Bild zu groß (max 10 MB) · Image too large (max 10 MB)",
  BAD_TYPE: "Nur Bilder · Images only (PNG, JPEG, GIF, WebP)",
  FAILED: "Upload fehlgeschlagen · Upload failed",
};

export const RichTextEditor = forwardRef<
  RichTextEditorHandle,
  {
    /** Form field name the HTML is submitted under. */
    name: string;
    defaultValue?: string;
    placeholder?: string;
    /** Fires whenever the empty-state flips (drives submit buttons). */
    onEmptyChange?: (empty: boolean) => void;
    className?: string;
    contentMinHeight?: string;
  }
>(function RichTextEditor(
  { name, defaultValue = "", placeholder, onEmptyChange, className, contentMinHeight = "6rem" },
  ref
) {
  const { t } = useT();
  const [html, setHtml] = useState(defaultValue);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  // Re-render on every transaction so toolbar active-states stay in sync.
  const [, bumpVersion] = useReducer((x: number) => x + 1, 0);
  // Latest onEmptyChange without re-creating the editor.
  const onEmptyChangeRef = useRef(onEmptyChange);
  onEmptyChangeRef.current = onEmptyChange;

  const uploadImage = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadEditorImageAction(fd);
      if (res.url) {
        editorRef.current?.chain().focus().setImage({ src: res.url, alt: file.name }).run();
      } else {
        setUploadError(UPLOAD_ERRORS[res.error ?? "FAILED"] ?? UPLOAD_ERRORS.FAILED);
      }
    } catch {
      setUploadError(UPLOAD_ERRORS.FAILED);
    } finally {
      setUploading(false);
    }
  }, []);

  // Manual lifecycle instead of useEditor(): created once on mount, destroyed
  // on unmount — deterministic under React 18 StrictMode double-mounting.
  useEffect(() => {
    const instance = new Editor({
      extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
      }),
      Image,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      UserMention.configure({
        suggestion: suggestion("userMention", "@", async (q) => {
          const users = await searchMentionUsersAction(q);
          return users.map((u) => ({ id: u.username, label: u.name, sub: `@${u.username}` }));
        }),
      }),
      TaskRef.configure({
        suggestion: suggestion("taskRef", "#", async (q) => {
          const tasks = await searchTaskRefsAction(q);
          return tasks.map((task) => ({ id: task.id, label: task.title, sub: task.status }));
        }),
      }),
    ],
    content: defaultValue,
    editorProps: {
      attributes: {
        dir: "auto",
        class: "rich-text rte-content focus:outline-none",
        style: `min-height:${contentMinHeight}`,
      },
      handlePaste: (_view, event) => {
        const images = Array.from(event.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith("image/")
        );
        if (!images.length) return false;
        event.preventDefault();
        images.forEach((f) => void uploadImage(f));
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const images = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith("image/")
        );
        if (!images.length) return false;
        event.preventDefault();
        images.forEach((f) => void uploadImage(f));
        return true;
      },
    },
      onUpdate: ({ editor: ed }) => {
        const empty = ed.isEmpty;
        setHtml(empty ? "" : ed.getHTML());
        onEmptyChangeRef.current?.(empty);
      },
      onTransaction: () => bumpVersion(),
    });
    editorRef.current = instance;
    setEditor(instance);
    return () => {
      instance.destroy();
      editorRef.current = null;
      setEditor(null);
    };
    // Editor is created exactly once; defaultValue/placeholder are mount-time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    clear: () => {
      editor?.commands.clearContent(true);
      setHtml("");
      onEmptyChangeRef.current?.(true);
    },
  }));

  // Close emoji/link popovers on outside click
  useEffect(() => {
    if (!emojiOpen && !linkOpen) return;
    function onDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setEmojiOpen(false);
        setLinkOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [emojiOpen, linkOpen]);

  function openLink() {
    if (!editor) return;
    setEmojiOpen(false);
    setLinkUrl(editor.getAttributes("link").href ?? "");
    setLinkOpen((v) => !v);
  }

  function applyLink() {
    if (!editor) return;
    const raw = linkUrl.trim();
    if (!raw) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const href = /^(https?:\/\/|mailto:|\/)/i.test(raw) ? raw : `https://${raw}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  }

  if (!editor) {
    // SSR / first client render before Tiptap mounts
    return (
      <div className={cn("rounded-md border border-input bg-background", className)}>
        <div className="h-9 border-b" />
        <div className="p-3 text-sm text-muted-foreground" style={{ minHeight: contentMinHeight }} />
        <input type="hidden" name={name} value={html} />
      </div>
    );
  }

  const btn = (active: boolean) =>
    cn(
      "inline-flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-muted",
      active && "bg-secondary text-primary"
    );

  return (
    <div
      className={cn(
        "relative rounded-md border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1" role="toolbar">
        <button type="button" title={t("editor.bold")} aria-label={t("editor.bold")} className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()}>
          <BoldIcon className="h-4 w-4" />
        </button>
        <button type="button" title={t("editor.italic")} aria-label={t("editor.italic")} className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <ItalicIcon className="h-4 w-4" />
        </button>
        <button type="button" title={t("editor.underline")} aria-label={t("editor.underline")} className={btn(editor.isActive("underline"))} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </button>
        <button type="button" title={t("editor.code")} aria-label={t("editor.code")} className={btn(editor.isActive("code"))} onClick={() => editor.chain().focus().toggleCode().run()}>
          <CodeIcon className="h-4 w-4" />
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button type="button" title={t("editor.link")} aria-label={t("editor.link")} className={btn(editor.isActive("link"))} onClick={openLink}>
          <Link2 className="h-4 w-4" />
        </button>
        <button type="button" title={t("editor.bulletList")} aria-label={t("editor.bulletList")} className={btn(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <ListIcon className="h-4 w-4" />
        </button>
        <button type="button" title={t("editor.orderedList")} aria-label={t("editor.orderedList")} className={btn(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </button>
        <button type="button" title={t("editor.quote")} aria-label={t("editor.quote")} className={btn(editor.isActive("blockquote"))} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <QuoteIcon className="h-4 w-4" />
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button type="button" title={t("editor.image")} aria-label={t("editor.image")} className={btn(false)} disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
        </button>
        <button
          type="button"
          title={t("editor.emoji")}
          aria-label={t("editor.emoji")}
          className={btn(emojiOpen)}
          onClick={() => {
            setLinkOpen(false);
            setEmojiOpen((v) => !v);
          }}
        >
          <Smile className="h-4 w-4" />
        </button>
      </div>

      {(emojiOpen || linkOpen) && (
        <div
          ref={popoverRef}
          className="absolute start-1 top-9 z-30 rounded-md border bg-popover p-2 shadow-md"
        >
          {emojiOpen && (
            <div className="grid max-h-48 w-64 grid-cols-8 gap-0.5 overflow-y-auto">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="rounded p-1 text-lg leading-none hover:bg-muted"
                  onClick={() => {
                    editor.chain().focus().insertContent(e).run();
                    setEmojiOpen(false);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          {linkOpen && (
            <div className="flex w-72 items-center gap-1">
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyLink();
                  }
                }}
                placeholder="https://…"
                autoFocus
                dir="ltr"
                className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none"
              />
              <button type="button" title={t("editor.linkApply")} aria-label={t("editor.linkApply")} className="rounded p-1.5 hover:bg-muted" onClick={applyLink}>
                <Check className="h-4 w-4" />
              </button>
              {editor.isActive("link") && (
                <button type="button" title={t("editor.linkRemove")} aria-label={t("editor.linkRemove")} className="rounded p-1.5 text-destructive hover:bg-muted" onClick={removeLink}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <EditorContent editor={editor} className="px-3 py-2 text-sm" />

      {uploadError && <p className="px-3 pb-2 text-xs text-destructive">{uploadError}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadImage(f);
          e.target.value = "";
        }}
      />
      <input type="hidden" name={name} value={html} />
    </div>
  );
});
