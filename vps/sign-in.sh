#!/bin/bash
# Wrapper so the command Jay types works from any folder.
cd /home/mipstats/mip-stat-room && exec node vps/sign-in.mjs "$@"
