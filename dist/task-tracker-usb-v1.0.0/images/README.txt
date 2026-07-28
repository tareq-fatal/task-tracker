Empty on purpose.

This is an ONLINE bundle: install.sh builds the application image on the target
server, which needs an internet connection for that one step.

For a server with no internet, ask for an OFFLINE bundle — its images/ folder
holds the ready-made container images and install.sh --offline loads them from
here instead of building anything.
