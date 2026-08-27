const { spawn } = require('child_process');
const path = require('path');

/**
 * Spawns the Python reconciliation script and parses its output JSON.
 */
function runReconciliationEngine(bankCsvPath, ledgerCsvPath, sessionId) {
  return new Promise((resolve, reject) => {
    const engineDir = path.resolve(__dirname, '../../../engine');
    const pythonScript = path.join(engineDir, 'reconcile.py');

    console.log(`[PythonRunner] Spawning Python engine for session ${sessionId}...`);

    // Use system python or python3
    const pythonProcess = spawn('python', [
      pythonScript,
      '--bank', bankCsvPath,
      '--ledger', ledgerCsvPath,
      '--session-id', sessionId,
      '--quiet'
    ], { cwd: engineDir });

    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`[PythonRunner] Engine failed with code ${code}:`, stderrData);
        return reject(new Error(`Reconciliation engine failed: ${stderrData || 'Unknown error'}`));
      }

      try {
        const jsonStart = stdoutData.indexOf('__JSON_OUTPUT_START__');
        const jsonEnd = stdoutData.indexOf('__JSON_OUTPUT_END__');

        let rawJson = '';
        if (jsonStart !== -1 && jsonEnd !== -1) {
          rawJson = stdoutData.substring(jsonStart + '__JSON_OUTPUT_START__'.length, jsonEnd).trim();
        } else {
          rawJson = stdoutData.trim();
        }

        const parsed = JSON.parse(rawJson);
        resolve(parsed);
      } catch (err) {
        console.error('[PythonRunner] Failed to parse Python JSON output:', err);
        console.error('Raw Output:', stdoutData);
        reject(new Error('Invalid JSON returned by reconciliation engine'));
      }
    });

    pythonProcess.on('error', (err) => {
      console.error('[PythonRunner] Failed to start Python process:', err);
      reject(err);
    });
  });
}

module.exports = { runReconciliationEngine };
