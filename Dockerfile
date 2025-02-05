FROM golang:1.23 AS build
## based on debian 11

RUN useradd -u 10001 dimo

WORKDIR /go/src/github.com/dimo-network/b2b-fleet-mgr-app/
COPY /api /go/src/github.com/dimo-network/b2b-fleet-mgr-app/
COPY /web /go/src/github.com/dimo-network/b2b-fleet-mgr-app/

ENV CGO_ENABLED=0
ENV GOOS=linux
ENV GOFLAGS=-mod=vendor

RUN apt-get clean && apt-get update
RUN curl -fsSL https://deb.nodesource.com/setup_21.x | bash -
RUN apt-get install -y nodejs
RUN go mod download
RUN go mod tidy
RUN go mod vendor
RUN make install
RUN npm install && npm run build

FROM busybox AS package

LABEL maintainer="DIMO <hello@dimo.zone>"

WORKDIR /

COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /etc/passwd /etc/passwd
COPY --from=build /go/src/github.com/dimo-network/b2b-fleet-mgr-app/target/bin/b2b-fleet-mgr-app .
COPY --from=build /go/src/github.com/dimo-network/b2b-fleet-mgr-app/dist /dist

USER dimo

EXPOSE 8080
EXPOSE 8888

CMD /dimo-admin