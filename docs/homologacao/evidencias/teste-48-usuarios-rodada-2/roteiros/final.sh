#!/bin/bash
. /home/user/r2/env.sh
echo "=== rebuild $(date +%T)"; bash /home/user/r2/rebuild.sh
run() { local name=$1; shift; echo "=== $name $(date +%T)"; (cd $DIR && env "$@" timeout 5400 node $SCRIPT) > /home/user/logs/final-$name.log 2>&1; echo "exit $? $(date +%T)"; tail -2 /home/user/logs/final-$name.log; }
DIR=/home/user/r48 SCRIPT=r7-erros.mjs run r7 X=1
DIR=/home/user/r48 SCRIPT=r7b-extra.mjs run r7b X=1
DIR=/home/user/r48 SCRIPT=r8-usabilidade-v2.mjs run r8 NF_DOC=2f2cb932-1324-44ce-828a-e56aae902b33 TAG=r2
DIR=/home/user/r2 SCRIPT=p5-papeis-ocioso.mjs run p5 X=1
DIR=/home/user/r48 SCRIPT=r6-dia.mjs run r6a X=1
cp /home/user/r48/r6-dia.out.json /home/user/r2/r6-dia-a.out.json
DIR=/home/user/r48 SCRIPT=r6-dia.mjs run r6b X=1
cp /home/user/r48/r6-dia.out.json /home/user/r2/r6-dia-b.out.json
DIR=/home/user/r2 SCRIPT=p4-auditoria-filtros.mjs run p4 CUT_0086=$(cat /home/user/r2/cut-0081.txt)
DIR=/home/user/r2 SCRIPT=p3-integridade.mjs run p3 PHASE=final
DIR=/home/user/r48 SCRIPT=r4-rbac.mjs run r4final X=1
cp /home/user/r48/r4-rbac.out.json /home/user/r2/r4-rbac-final.out.json
echo "=== FIM $(date +%T)"
