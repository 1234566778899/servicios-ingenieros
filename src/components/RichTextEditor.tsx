import { useEffect, type ReactElement, type ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Toolbar, ToolbarButton, ToolbarDivider, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import {
  ArrowRedo20Regular, ArrowUndo20Regular, TextBold20Regular, TextBulletListLtr20Regular, TextClearFormatting20Regular,
  TextItalic20Regular, TextNumberListLtr20Regular, TextUnderline20Regular,
} from '@fluentui/react-icons';
import { sanitizeRich, toRichHtml } from '../lib/richText';

const useStyles = makeStyles({
  root: {
    border: `1px solid ${tokens.colorNeutralStroke1}`, borderBottomColor: tokens.colorNeutralStrokeAccessible,
    borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, overflow: 'hidden',
    ':focus-within': { borderBottomColor: tokens.colorCompoundBrandStroke },
  },
  disabled: { backgroundColor: tokens.colorNeutralBackground3 },
  toolbar: { borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, padding: '2px 4px', flexWrap: 'wrap' },
  on: { backgroundColor: tokens.colorNeutralBackground1Selected, color: tokens.colorBrandForeground1 },
  content: {
    padding: '6px 10px', minHeight: '72px', maxHeight: '320px', overflowY: 'auto', cursor: 'text',
    fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase300,
    '& .ProseMirror': { outline: 'none', minHeight: '60px' },
    '& .ProseMirror p': { margin: '0 0 6px' },
    '& .ProseMirror ul, & .ProseMirror ol': { margin: '0 0 6px', paddingLeft: '22px' },
    '& .ProseMirror li p': { margin: 0 },
    '& .ProseMirror p.is-editor-empty:first-child::before': {
      content: 'attr(data-placeholder)', color: tokens.colorNeutralForeground4, float: 'left', height: 0, pointerEvents: 'none',
    },
  },
});

/** Editor de texto con formato (negrita, cursiva, subrayado, listas). Devuelve HTML limpio. */
export function RichTextEditor({ value, onChange, placeholder, disabled, extra }: {
  value: string; onChange: (html: string) => void; placeholder?: string; disabled?: boolean;
  /** Botones adicionales al final de la barra (p. ej. textos frecuentes) */
  extra?: (insert: (text: string) => void) => ReactNode;
}) {
  const s = useStyles();
  const editor = useEditor({
    extensions: [StarterKit.configure({
      heading: false, blockquote: false, code: false, codeBlock: false, horizontalRule: false, strike: false, link: false,
    })],
    content: toRichHtml(value),
    editable: !disabled,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { 'aria-label': placeholder ?? 'Descripción' },
      // Lo pegado desde Word/WhatsApp entra sin estilos ajenos
      transformPastedHTML: sanitizeRich,
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : sanitizeRich(e.getHTML())),
  });

  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);

  // Placeholder sin la extensión aparte: atributo sobre el primer párrafo vacío
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const sync = () => {
      const first = dom.querySelector('p');
      dom.querySelectorAll('p.is-editor-empty').forEach((p) => p.classList.remove('is-editor-empty'));
      if (editor.isEmpty && first && placeholder) { first.classList.add('is-editor-empty'); first.setAttribute('data-placeholder', placeholder); }
    };
    sync();
    editor.on('update', sync);
    editor.on('create', sync);
    return () => { editor.off('update', sync); editor.off('create', sync); };
  }, [editor, placeholder]);

  if (!editor) return null;
  const btn = (label: string, icon: ReactElement, run: () => void, active?: boolean, enabled = true) => (
    <Tooltip content={label} relationship="label" withArrow>
      <ToolbarButton icon={icon} className={active ? s.on : undefined} aria-pressed={active} disabled={disabled || !enabled}
        // Sin perder la selección del editor al pulsar el botón
        onMouseDown={(e) => e.preventDefault()} onClick={run} />
    </Tooltip>
  );
  const chain = () => editor.chain().focus();

  return (
    <div className={mergeClasses(s.root, disabled && s.disabled)}>
      {!disabled && (
        <Toolbar size="small" className={s.toolbar} aria-label="Formato">
          {btn('Negrita (Ctrl+B)', <TextBold20Regular />, () => chain().toggleBold().run(), editor.isActive('bold'))}
          {btn('Cursiva (Ctrl+I)', <TextItalic20Regular />, () => chain().toggleItalic().run(), editor.isActive('italic'))}
          {btn('Subrayado (Ctrl+U)', <TextUnderline20Regular />, () => chain().toggleUnderline().run(), editor.isActive('underline'))}
          <ToolbarDivider />
          {btn('Viñetas', <TextBulletListLtr20Regular />, () => chain().toggleBulletList().run(), editor.isActive('bulletList'))}
          {btn('Lista numerada', <TextNumberListLtr20Regular />, () => chain().toggleOrderedList().run(), editor.isActive('orderedList'))}
          {btn('Quitar formato', <TextClearFormatting20Regular />, () => chain().unsetAllMarks().clearNodes().run())}
          <ToolbarDivider />
          {btn('Deshacer (Ctrl+Z)', <ArrowUndo20Regular />, () => chain().undo().run(), false, editor.can().undo())}
          {btn('Rehacer (Ctrl+Y)', <ArrowRedo20Regular />, () => chain().redo().run(), false, editor.can().redo())}
          {extra?.((text) => chain().insertContent(toRichHtml(text)).run())}
        </Toolbar>
      )}
      <EditorContent editor={editor} className={s.content} onClick={() => !editor.isFocused && editor.commands.focus()} />
    </div>
  );
}
