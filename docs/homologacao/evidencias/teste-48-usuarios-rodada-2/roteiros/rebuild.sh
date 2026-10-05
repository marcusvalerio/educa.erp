#!/bin/bash
for p in $(ps -eo pid,args | awk '/next (start|-server)|next-server/ && !/awk/ {print $1}'); do kill $p 2>/dev/null; done
sleep 2
cd /home/user/educa.erp && npx next build > /home/user/logs/build.log 2>&1; echo "build exit $?"
(nohup npx next start -p 3200 > /home/user/logs/app.log 2>&1 &)
for i in $(seq 1 60); do c=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3200/login); [ "$c" = 200 ] && break; sleep 1; done; echo app $c
