import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';

const komponenten: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  table: ({ node: _node, ...props }) => (
    <div className="tabelle-scroll">
      <table {...props} />
    </div>
  ),
};

const REMARK = [remarkGfm, remarkMath];
const REHYPE = [rehypeKatex];

/** Rendert Lernstoff-Markdown mit LaTeX. Rohes HTML wird nicht interpretiert (kein rehype-raw). */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE} components={komponenten}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
