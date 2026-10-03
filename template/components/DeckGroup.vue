<script setup>
import {computed} from 'vue'
const props=defineProps({clip:{type:Boolean,default:false},fill:{type:String,default:'transparent'}})
const appearance=computed(()=>({overflow:props.clip?'hidden':'visible',background:props.fill}))
</script>
<template><div class="deck-group" :style="appearance"><span class="deck-group-guard" style="display:none"></span><slot /></div></template>
<studio lang="yaml">
description: Figma frame or group preserving its child objects
category: Deck objects
props:
  clip:
    label: Clip contents
    control: checkbox
  fill:
    label: Background fill
    control: color
</studio>
