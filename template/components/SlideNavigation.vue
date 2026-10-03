<script setup>
const props = defineProps({ target: { type: [String, Number], default: null } })
function navigate(event) {
  if (!props.target || event.defaultPrevented || document.documentElement.classList.contains('slidev-studio-docked')) return
  const current = window.location.pathname
  const base = current.replace(/\/?\d+\/?$/, '/').replace(/\/$/, '')
  window.location.assign(`${base}/${props.target}`)
}
</script>
<template><div class="figma-navigation" @click="navigate"><slot /></div></template>
<style>.figma-navigation {width:100%;height:100%;}</style>
