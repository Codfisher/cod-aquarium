/**
 * 將多個 block 組裝後可產生 cluster
 */

interface Content {
  blockList: any[];
}

interface ClusterRule {
  type: string;
  condition: (content: Content) => boolean;
  transform: (content: Content) => Content;
}

export const clusterRuleList = [
  /** 蟲鳴 */
  {
    type: 'insect',
    condition(content: Content) {
      return true
    },
    transform(content: Content) {
      return content
    },
  },

  /** 鳥叫 */
  {
    type: 'bird',
    condition(content: Content) {
      return true
    },
    transform(content: Content) {
      return content
    },
  },

  /** 蛙鳴 */
  {
    type: 'frog',
    condition(content: Content) {
      return true
    },
    transform(content: Content) {
      return content
    },
  },

  /** 獸鳴 */
  {
    type: 'beast',
    condition(content: Content) {
      return true
    },
    transform(content: Content) {
      return content
    },
  },
] as const satisfies ClusterRule[]

export type ClusterType = (typeof clusterRuleList)[number]['type']
