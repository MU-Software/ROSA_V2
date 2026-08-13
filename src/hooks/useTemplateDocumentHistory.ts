import { useCallback, useState } from "react";
import type { PrintTemplateDocument } from "../printing/templateDocument";

type TemplateDocumentHistory = {
  past: PrintTemplateDocument[];
  present: PrintTemplateDocument;
  future: PrintTemplateDocument[];
};

const HISTORY_LIMIT = 50;

export const useTemplateDocumentHistory = (initialDocument: PrintTemplateDocument) => {
  const [history, setHistory] = useState<TemplateDocumentHistory>({
    past: [],
    present: initialDocument,
    future: [],
  });

  const commit = useCallback((document: PrintTemplateDocument) => {
    setHistory((current) => document === current.present
      ? current
      : {
        past: [...current.past, current.present].slice(-HISTORY_LIMIT),
        present: document,
        future: [],
      });
  }, []);

  const replace = useCallback((document: PrintTemplateDocument) => {
    setHistory({ past: [], present: document, future: [] });
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (!previous) return current;
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) return current;
      return {
        past: [...current.past, current.present],
        present: next,
        future: current.future.slice(1),
      };
    });
  }, []);

  return {
    document: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    commit,
    replace,
    undo,
    redo,
  };
};
