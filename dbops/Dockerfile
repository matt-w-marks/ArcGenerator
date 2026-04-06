FROM postgres:17-alpine

# psql ships in the postgres image. Add bash for friendlier scripting.
RUN apk add --no-cache bash

COPY scripts/ /scripts/
RUN chmod +x /scripts/*.sh

WORKDIR /scripts
ENTRYPOINT ["/bin/bash"]
