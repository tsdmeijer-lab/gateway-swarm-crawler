const { spawn } = require('child_process');

console.log("Starting Local Swarm Orchestrator...");
console.log("Spawning 15 isolated workers to process 150 items (10 items each)...");

const totalChunks = 15;
let completed = 0;

for (let i = 0; i < totalChunks; i++) {
  const worker = spawn('node', ['parallel_swarm.js'], {
    env: { ...process.env, CHUNK_INDEX: i.toString() },
    stdio: 'inherit'
  });

  worker.on('exit', (code) => {
    completed++;
    console.log(`[Orchestrator] Worker ${i} finished with code ${code}. (${completed}/${totalChunks})`);
    if (completed === totalChunks) {
      console.log("=========================================");
      console.log("🎉 All 15 workers have finished completely!");
      console.log("=========================================");
    }
  });
}
