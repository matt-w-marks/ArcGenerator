FROM postgres:17-alpine

# psql ships in the postgres image. Add bash for friendlier scripting.
RUN apk add --no-cache bash

COPY scripts/ /scripts/
RUN chmod +x /scripts/*.sh

WORKDIR /scripts

# Default: run bootstrap.sh. Override CMD to run a different script:
#   docker run dbops psql-shell.sh
# Or via Container Apps Job: set "Arguments override" to e.g. "psql-shell.sh".
ENTRYPOINT ["/bin/bash"]
CMD ["bootstrap.sh"]
