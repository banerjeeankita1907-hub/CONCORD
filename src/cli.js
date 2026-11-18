import { runExperiments } from "./experiments.js";

const report = runExperiments();
console.log("CONCORD — bounded concurrency verification laboratory");
console.log("");
console.log("Independent scheduling:");
console.log(`  exhaustive states: ${report.independentSchedule.baseline.exploredStates}`);
console.log(`  sleep-set configurations: ${report.independentSchedule.reduced.exploredConfigurations}`);
console.log(`  transition extensions removed: ${report.independentSchedule.transitionExtensionsRemoved}`);
console.log(`  independence audit: ${report.independentSchedule.independenceAudit.status}`);
console.log("");
console.log("Replicated register:");
console.log(`  Lamport LWW: ${report.replicatedRegister.lwwBaseline.status}`);
console.log(`  LWW independence audit: ${report.replicatedRegister.lwwIndependenceAudit.status}`);
console.log(`  arrival-order negative control: ${report.replicatedRegister.arrivalOrderNegativeControl.status}`);
console.log("");
console.log("Linearizability:");
console.log(`  valid overlapping history: ${report.linearizability.overlappingHistory.status}`);
console.log(`  stale-read negative control: ${report.linearizability.staleReadNegativeControl.status}`);
