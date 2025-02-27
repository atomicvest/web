<script>
import { version } from '../package.json';
import logo from './assets/logo.svg';
import {
  FeatureFlag,
  NotificationBar,
  AnnouncementBar,
  Avatar,
} from '~components';
import {
  ENVIRONMENT_LIST,
  NOTIFICATION_TIMEOUT,
  NOTIFICATION_TYPE_SUCCESS,
  NOTIFICATION_TYPE_ERROR,
} from '~constants';
import {
  getEnvironment,
  getEnvironmentList,
  getEnvironmentLocation,
} from '~helpers';

import {
  discardVersionAnnouncement,
  getNewVersionAnnouncement,
} from '~features/version-info';

export default {
  components: {
    'feature-flag': FeatureFlag,
    'notification-bar': NotificationBar,
    'announcement-bar': AnnouncementBar,
    avatar: Avatar,
  },
  data() {
    const { origin } = window.location;
    const environmentList = ENVIRONMENT_LIST;

    return {
      environment: {
        list: getEnvironmentList({
          environmentList,
          origin,
        }),
        value: getEnvironment({
          environmentList,
          origin,
        }),
      },
      logo,
      notification: {
        message: '',
        show: false,
        type: '',
        timeout: undefined,
      },
      announcement: {
        message: '',
        show: false,
        link: '',
        severity: '',
      },
      onVersionAnnouncementClose: () => {},
      webSettings: undefined,
      currentUser: undefined,
    };
  },
  beforeDestroy() {
    clearTimeout(this.notification.timeout);
  },
  async created() {
    await Promise.all([this.getCurrentUser(), this.getWebSettings()]);
    this.redirectIfApplicable();
    await this.announceNewVersionIfExists();
  },
  methods: {
    onEnvironmentSelectChange(environment) {
      if (environment === this.environment.value) {
        return;
      }

      const { pathname, search } = window.location;

      window.location = getEnvironmentLocation({
        environment,
        pathname,
        search,
      });
    },
    onNotification({ message, type = NOTIFICATION_TYPE_SUCCESS }) {
      this.notification.message = message;
      this.notification.type = type;
      this.notification.show = true;
    },
    onNotificationClose() {
      this.notification.show = false;
    },
    onAnnouncementClose() {
      this.announcement.show = false;
      this.onVersionAnnouncementClose();
    },
    async getWebSettings() {
      this.webSettings = await this.$http('/api/web-settings');
    },
    async getCurrentUser() {
      const me = await this.$http('/api/me');

      this.currentUser = me?.user;
    },
    redirectIfApplicable() {
      const { auth, routing } = this.webSettings;

      if (auth?.enabled && !this.currentUser) {
        this.$router.push('/signin');

        return;
      }

      if (
        routing?.defaultToNamespace &&
        (this.$route.params.namespace ||
          this.$route.fullPath == '/namespaces') &&
        routing.defaultToNamespace !== this.$route.params.namespace
      ) {
        const { defaultToNamespace } = routing;

        if (this.$route.params.namespace) {
          this.onNotification({
            message: `No access to namespace ${this.$route.params.namespace}. Redirecting to ${defaultToNamespace}`,
            type: NOTIFICATION_TYPE_ERROR,
          });
        }

        this.$router.push(`/namespaces/${defaultToNamespace}/workflows`);

        return;
      }
    },
    async announceNewVersionIfExists() {
      const {
        show,
        message,
        link,
        version,
        severity,
      } = await getNewVersionAnnouncement(this.$http, this.onNotification);

      this.announcement = { show, message, link, severity };

      if (version) {
        this.onVersionAnnouncementClose = () =>
          discardVersionAnnouncement(version);
      }
    },
  },
  watch: {
    'notification.show'(value) {
      clearTimeout(this.notification.timeout);

      if (value) {
        this.notification.timeout = setTimeout(
          this.onNotificationClose,
          NOTIFICATION_TIMEOUT
        );
      }
    },
  },
  computed: {
    version() {
      return `v${version} web`;
    },
  },
};
</script>

<template>
  <main>
    <notification-bar
      :message="notification.message"
      :onClose="onNotificationClose"
      :show="notification.show"
      :type="notification.type"
    />
    <announcement-bar
      :message="announcement.message"
      :onClose="onAnnouncementClose"
      :show="announcement.show"
      :link="announcement.link"
      :severity="announcement.severity"
    />
    <header class="top-bar">
      <router-link :to="{ name: 'namespaces' }" class="logo">
        <div v-html="logo"></div>
        <span class="version">{{ version }}</span>
      </router-link>
      <feature-flag name="environment-select">
        <v-select
          class="environment-select"
          :on-change="onEnvironmentSelectChange"
          :options="environment.list"
          :searchable="false"
          :value="environment.value"
        />
      </feature-flag>

      <div class="namespace" v-if="$route.params.namespace">
        <a
          class="workflows"
          :class="{
            'router-link-active':
              $route.path ===
              `/namespaces/${$route.params.namespace}/workflows`,
          }"
          :href="`/namespaces/${$route.params.namespace}/workflows`"
        >
          {{ $route.params.namespace }}
        </a>
      </div>
      <div class="detail-view workflow-id" v-if="$route.params.workflowId">
        <span>{{ $route.params.workflowId }}</span>
      </div>
      <div class="detail-view task-queue" v-if="$route.params.taskQueue">
        <span>{{ $route.params.taskQueue }}</span>
      </div>
      <a v-if="currentUser" class="user" href="/signin">
        <avatar :label="currentUser.name" :picture="currentUser.picture" />
      </a>
    </header>
    <router-view @onNotification="onNotification"></router-view>
    <modals-container />
    <v-dialog />
  </main>
</template>

<style src="vue-virtual-scroller/dist/vue-virtual-scroller.css"></style>
<style src="vue2-datepicker/index.css"></style>
<style src="pretty-checkbox/dist/pretty-checkbox.min.css"></style>
<style lang="stylus">
@import "https://d1a3f4spazzrp4.cloudfront.net/uber-fonts/4.0.0/superfine.css"
@import "https://d1a3f4spazzrp4.cloudfront.net/uber-icons/3.14.0/uber-icons.css"
@require "./styles/definitions"
@require "./styles/reset"

global-reset()

@import "./styles/base"
@import "./styles/select"
@import "./styles/modal"
@import "./styles/code"

header.top-bar
  display flex
  flex 0 0 auto
  align-items center
  background-color uber-black
  padding 0 page-margin-x
  color base-ui-color
  height top-nav-height
  h2
    font-size 18px
    margin-right inline-spacing-large
    padding page-margin-y inline-spacing-large page-margin-y 0
  a
    display inline-block
    h2
      color uber-white-80
    &.config
      margin-left inline-spacing-medium
      icon('\ea5f')
    &.logo {
      margin-right: layout-spacing-medium;
      position: relative;
    }
  .user
    margin-left auto
    color: white

  svg
    display inline-block
    height top-nav-height - 20px

  spacing = 1.3em
  nav-label-color = uber-white-40
  nav-label-font-size = 11px
  div.namespace
    flex 0 0 auto
    &::before
      content 'NAMESPACE'
      font-size nav-label-font-size
      font-weight normal
      vertical-align middle
      color nav-label-color
      margin-right spacing
    a:hover
      color lighten(uber-blue, 15%)
    span
      cursor pointer
      transition smooth-transition
      color uber-blue
    & + div
      icon('\ea5b')
      one-liner-ellipsis()
      &::before
        display inline-block
        transform scale(1.5)
        margin-right spacing
  .detail-view span::before
    font-size nav-label-font-size
    color nav-label-color
    margin-right spacing
  div.workflow-id span::before
      content 'WORKFLOW ID'
  div.task-queue span::before
      content 'TASK QUEUE'
  .version {
    color: #c6c6c6;
    font-size: 10px;
    position: absolute;
    right: 4px;
    bottom: 0;
  }

  .environment-select {
    .dropdown-toggle {
      border-color: transparent;
    }

    .open-indicator:before {
      border-color: uber-blue;
    }

    .selected-tag {
      color: white;
      font-weight: bold;
    }
  }

body, main
  height 100%
main
  position absolute
  width 100%
  display flex
  flex-direction column

main
  > section
    display flex
    flex-direction column
    flex 1 1 auto
    > header:last-of-type
      margin-bottom layout-spacing-small
    > header
      display flex
      align-items: start;
      flex 0 0 auto
      > *
        margin inline-spacing-small

area-loader, section.loading
  size = 32px
  &::after
    content ''
    display block
    position absolute
    width size
    height size
    border-radius size
    left "calc(50% - %s)" % (size/2)
    top 300px;
    border 3px solid uber-blue
    border-bottom-color transparent
    animation spin 800ms linear infinite
</style>
