// The intended way: the failure handled by .catch, or by report.ts's done.
import { done } from '../../../../site/report.ts';

declare const loaded: Promise<string>;
declare const shown: (text: string) => void;
declare const failed: (error: unknown) => void;
loaded.then(shown).catch(failed);
done(loaded.then(shown), 'the text');
