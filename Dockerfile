# builder container
#   - builds the frontend app (Vue, React, Webpack, ...)

# Use an official node image
FROM geographica/gdal2:2.3.2

RUN apt-get update --fix-missing
RUN apt-get install -y curl locales poppler-utils vim checkinstall libwebp-dev libopenjp2-7-dev libtiff-dev libdjvulibre-dev libopenexr-dev libjbig-dev librsvg2-dev libltdl-dev libde265-dev

#locales

ENV LOCALE de_DE
ENV ENCODING UTF-8

RUN locale-gen ${LOCALE}.${ENCODING}
ENV LANG ${LOCALE}.${ENCODING}
ENV LANGUAGE ${LOCALE}.${ENCODING}
ENV LC_ALL ${LOCALE}.${ENCODING}
ENV TZ Europe/Berlin

RUN locale-gen --purge

# ImageMagick with openj2 support

ADD https://imagemagick.org/archive/ImageMagick-6.9.12-72.tar.gz /tmp
#ADD https://www.imagemagick.org/download/ImageMagick.tar.gz /tmp
RUN tar xzvf /tmp/ImageMagick-6.9.12-72.tar.gz -C /tmp/ && \
    cd /tmp/ImageMagick-6.9.12-72 && \
    ./configure --enable-shared --with-modules --with-gslib && \
    make && \
    make install && \
    ldconfig /usr/local/lib && \
    identify -version

RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list

RUN apt -y install curl dirmngr apt-transport-https lsb-release ca-certificates
RUN curl -sL https://deb.nodesource.com/setup_14.x | bash -

RUN apt -y install nodejs

RUN apt-get update -y 
RUN apt-get install -y yarn

RUN node --version

RUN yarn --version 

RUN yarn global add babel-cli file-type mkdir-recursive pm2 restify restify-errors

# Reads args and use them to configure the build, setting
# them as env vars
ARG NODE_ENV
ARG API_URL

ENV NODE_ENV $NODE_ENV
ENV API_URL $API_URL

WORKDIR /app

# copy example docs
COPY ./exampleDocs ./exampleDocs/

# Install dependencies
COPY package*.json ./
COPY yarn.lock ./
RUN yarn install
RUN yarn cache clean


# Copy the rest
COPY ./.babelrc ./
COPY *.json ./
COPY *.js ./

EXPOSE 8081

RUN pm2 update

#ENTRYPOINT ["/bin/sh", "-c", "yarn", "run"]

CMD ["yarn", "run", "production-run"]
