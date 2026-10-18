/**
 * Strict foreground-console command dispatcher.
 * Never connected to Fastify routes and never echoes arbitrary operator text:
 * pasted secrets must not leak into standard output or structured logs.
 */
export function handleOperatorCommand(line,{security,write}){
 if(typeof line!=='string'||!security||typeof write!=='function')throw Error('OPERATOR_CONSOLE_INVALID');
 const command=line.trim().toLowerCase();
 if(command==='pair'){
  security.rearmFromLocalOperator();
  write('ContentStudio: all browser sessions revoked.\n');
  write(`New pairing code: ${security.pairingCodeForTerminal()}\n`);
  write('Enter this code in the browser pairing page.\n');
  return 'REARMED';
 }
 if(command==='help'){
  write('Commands: pair (rotate browser session and show a new one-time code), help.\n');
  return 'HELP';
 }
 if(command)write('Unknown command. Type help.\n');
 return 'IGNORED';
}
