#!/bin/bash
cd /home/user/r48 && . /home/user/r2/env.sh
for s in r4-rbac r3-isolamento r9-auditoria-dados; do
  echo "=== $s $(date +%T)"; timeout 5400 node $s.mjs > /home/user/logs/suite-$s.log 2>&1; echo "exit $? $(date +%T)"; tail -2 /home/user/logs/suite-$s.log
done
echo "=== FIM $(date +%T)"
