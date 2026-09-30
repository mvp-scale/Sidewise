/**
 * The shape and loader of docs/story.yaml, in its own module so the README checker and the site builder
 * can both use it without importing each other.
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export type Story = {
  tagline: string;
  identity: string;
  numbers: { text: string; method: string }[];
  install: { claude: string; claudeInstall: string; npm: string; npmInit: string; endpoint: string };
  useCases: { title: string; verb: string }[];
};

export function loadStory(file = 'docs/story.yaml'): Story {
  return parse(readFileSync(file, 'utf8')) as Story;
}
