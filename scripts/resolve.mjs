import { read } from './studionet.mjs';
import demo from '../src/demo.json' with { type: 'json' };

const address = process.argv[2] || demo.address;
if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Supply the exact contract address.');
const route = await read(address, 'route');
if (!route?.hostname) throw new Error('No active hostname has been published.');
console.log(JSON.stringify({ url: 'https://' + route.hostname, revision: route.revision, directory: address }));
