import shared from "./generated/shared";

export const lexicon = (name: string): string[] => {
  const v = shared.lexicons[name];
  if (!Array.isArray(v)) throw new Error(`unknown lexicon ${name}`);
  return v;
};

export default shared;
