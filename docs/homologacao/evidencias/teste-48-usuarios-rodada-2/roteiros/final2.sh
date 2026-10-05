#!/bin/bash
. /home/user/r2/env.sh
echo "=== rebuild $(date +%T)"; bash /home/user/r2/rebuild.sh
run() { local name=$1; shift; echo "=== $name $(date +%T)"; (cd $DIR && env "$@" timeout 5400 node $SCRIPT) > /home/user/logs/final2-$name.log 2>&1; echo "exit $? $(date +%T)"; tail -2 /home/user/logs/final2-$name.log; }
DIR=/home/user/r48 SCRIPT=r7-erros.mjs run r7 X=1
cp /home/user/r48/r7-erros.out.json /home/user/r2/r7-erros-final.out.json
DIR=/home/user/r2 SCRIPT=p7-nf-celular.mjs run p7 NF_DOC=2f2cb932-1324-44ce-828a-e56aae902b33
DIR=/home/user/r2 SCRIPT=p1-reproducao.mjs run p1 PHASE=final
DIR=/home/user/r2 SCRIPT=p2-fiscal.mjs run p2 PHASE=final
DIR=/home/user/r2 SCRIPT=p3-integridade.mjs run p3 PHASE=final2
echo "=== FIM $(date +%T)"
