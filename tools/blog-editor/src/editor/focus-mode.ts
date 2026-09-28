import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** Marks the top-level block that holds the caret with `is-current`. Focus mode dims every other block. */
export const CurrentBlock = Extension.create({
  name: 'currentBlock',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('currentBlock'),
      props: {
        decorations(state) {
          const { $from } = state.selection;
          if ($from.depth === 0) {
            // a selected top-level node (image, divider)
            const node = state.doc.nodeAt($from.pos);
            return node ? DecorationSet.create(state.doc, [Decoration.node($from.pos, $from.pos + node.nodeSize, { class: 'is-current' })]) : null;
          }
          const start = $from.before(1);
          return DecorationSet.create(state.doc, [Decoration.node(start, start + $from.node(1).nodeSize, { class: 'is-current' })]);
        },
      },
    })];
  },
});
