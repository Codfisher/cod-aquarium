export default defineAppConfig({
  docus: {
    title: '鱈魚的魚缸',
    description: '各種鱈魚滾鍵盤的雜記',
    header: {
      title: '鱈魚的魚缸',
      fluid: true,
    },
    main: {
      fluid: true,
    },
    footer: {
      fluid: true,
    },
    aside: {
      level: 1,
    },
    socials: {
      youtube: 'https://www.youtube.com/@codfish2140',

      gitlab: {
        icon: 'vscode-icons:file-type-gitlab',
        label: 'GitLab',
        href: 'https://gitlab.com/codfish2140',
      },
      linkedin: {
        icon: 'logos:linkedin-icon',
        label: 'LinkedIn',
        href: 'https://www.linkedin.com/in/shih-chen-lin-codfish/',
      },
    },
  },

  prose: {
    h1: {
      icon: 'ph:fish-simple-light'
    },
    h2: {
      icon: 'ph:fish-simple-light'
    },
    h3: {
      icon: 'ph:fish-simple-light'
    },
    h4: {
      icon: 'ph:fish-simple-light'
    },
    copyButton: {
      iconCopy: 'carbon:fish-multiple',
    }
  }
})
