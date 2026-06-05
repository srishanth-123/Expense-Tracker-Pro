/**
 * Cluster Mode Entry Point
 * -------------------------
 * Forks one Express worker per CPU core. In production, this utilizes
 * all available cores (e.g., 4-core server runs 4 Express instances).
 *
 * Usage:
 *   Development:  npm run dev         → single process (server.js)
 *   Production:   npm run start:cluster → one worker per CPU core
 *
 * Each worker is an independent Express server sharing the same port.
 * Node.js cluster module distributes incoming connections via round-robin.
 * Workers auto-restart on crash with a 2-second delay.
 */

const cluster = require("cluster");
const os = require("os");

const numCPUs = os.cpus().length;

if (cluster.isPrimary) {
    console.log(`\n🔧 Cluster Master (PID ${process.pid}) starting ${numCPUs} workers...\n`);

    // Fork one worker per CPU core
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // Auto-restart crashed workers
    cluster.on("exit", (worker, code, signal) => {
        console.warn(
            `⚠️  Worker ${worker.process.pid} exited (code: ${code}, signal: ${signal}). Restarting in 2s...`
        );
        setTimeout(() => cluster.fork(), 2000);
    });

    cluster.on("online", (worker) => {
        console.log(`   ✅ Worker ${worker.process.pid} is online`);
    });
} else {
    // Each worker runs the full Express server
    require("./server.js");
}
