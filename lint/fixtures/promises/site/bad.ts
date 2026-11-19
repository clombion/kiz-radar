// What house/promises refuses: .then with a second argument for the failure, alone, chained or after a .catch, called
// optionally or on an optional chain, by a key in quotes, or with type arguments.
declare const loaded: Promise<string>;
declare const shown: (text: string) => void;
declare const failed: (error: unknown) => void;
loaded.then(shown, failed); // refused
loaded.then(shown, failed).catch(failed); // refused
loaded.catch(failed).then(shown, failed); // refused
loaded.then(shown, failed).then(shown, failed); // refused: promises, promises
loaded.then?.(shown, failed); // refused
declare const maybe: Promise<string> | null;
maybe?.then(shown, failed); // refused
loaded['then'](shown, failed); // refused
loaded.then<void>(shown, failed); // refused
