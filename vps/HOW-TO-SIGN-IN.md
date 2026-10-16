# How to sign the Stat Room updater back in

When DUPR or Scoreholio signs the server out, you get an email titled
"MIP Stats: please sign in to ... again". These are the same steps.
The website keeps showing its last good update until you do this - nothing
is broken or lost. Stuck? Open Claude Code and say: help me sign the MIP
Stats updater back in.

## DUPR (your own account - weekly ratings)

```
DUPR has signed your server out, which websites do every few months.
Until you sign in again, the Stat Room can't fetch the weekly DUPR ratings.

You need: your Windows PC, Google Chrome, and your DUPR email and password.
You will type the password into DUPR's own page. Nobody else sees it.

STEP 1 - Connect to your server
  a. On your PC, click Start, type  PowerShell  and press Enter.
  b. In the blue window, type this line exactly and press Enter:
       ssh -L 9222:localhost:9222 Jay@100.110.182.100
  c. If it asks for a password, that is your SERVER password (the one you
     use to log in to the server), not DUPR's.

STEP 2 - Start the sign-in browser on the server
  In that same window, type this and press Enter:
       sudo -u mipstats /home/mipstats/mip-stat-room/vps/sign-in.sh dupr
  It says "Waiting for you to sign in". Leave this window open.

STEP 3 - Open that browser from your PC
  a. Open Google Chrome on your PC.
  b. Click the address bar, type  chrome://inspect  and press Enter.
  c. Under "Remote Target" you will see a DUPR page. Click the blue word
     "inspect" under it. A new window opens with the DUPR page on the left.
     (Nothing listed? Wait 10 seconds - it refreshes by itself.)

STEP 4 - Sign in
  In that window, click into DUPR's Email box and sign in the normal way
  (if a cookie notice shows, click Accept first).
  When you're signed in, go back to the PowerShell window. Within a few
  seconds it says "Signed in and saved". You're done - close both windows.

If the PowerShell window says "Gave up waiting", just start again at Step 2.
These same steps are on the server in /home/mipstats/mip-stat-room/vps/HOW-TO-SIGN-IN.md
```

## Scoreholio (Dave's organizer account - league nights)

```
Scoreholio has signed your server out, which websites do every few months.
Until you sign in again, the Stat Room can't fetch new league nights.

You need: your Windows PC, Google Chrome, and Dave's Scoreholio email and password.
You will type the password into Scoreholio's own page. Nobody else sees it.

STEP 1 - Connect to your server
  a. On your PC, click Start, type  PowerShell  and press Enter.
  b. In the blue window, type this line exactly and press Enter:
       ssh -L 9222:localhost:9222 Jay@100.110.182.100
  c. If it asks for a password, that is your SERVER password (the one you
     use to log in to the server), not Scoreholio's.

STEP 2 - Start the sign-in browser on the server
  In that same window, type this and press Enter:
       sudo -u mipstats /home/mipstats/mip-stat-room/vps/sign-in.sh scoreholio
  It says "Waiting for you to sign in". Leave this window open.

STEP 3 - Open that browser from your PC
  a. Open Google Chrome on your PC.
  b. Click the address bar, type  chrome://inspect  and press Enter.
  c. Under "Remote Target" you will see a Scoreholio page. Click the blue word
     "inspect" under it. A new window opens with the Scoreholio page on the left.
     (Nothing listed? Wait 10 seconds - it refreshes by itself.)

STEP 4 - Sign in
  In that window, click the red LOGIN button, then sign in the normal way
  (if a cookie notice shows, click Accept first).
  If you don't see Dave's tournament list after signing in, click
  TOURNAMENTS at the top of the page. Don't click anything else.
  When you're signed in, go back to the PowerShell window. Within a few
  seconds it says "Signed in and saved". You're done - close both windows.

If the PowerShell window says "Gave up waiting", just start again at Step 2.
These same steps are on the server in /home/mipstats/mip-stat-room/vps/HOW-TO-SIGN-IN.md
```
