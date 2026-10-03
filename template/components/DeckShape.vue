<script setup>
import {computed} from 'vue'
const props=defineProps({fill:{type:String,default:'transparent'},radius:{type:Number,default:0}})
const appearance=computed(()=>({background:props.fill,borderRadius:`${props.radius}px`}))
</script>
<template><div class="deck-shape" :style="appearance" /></template>
<studio lang="yaml">
description: Editable Figma shape
category: Deck objects
props:
  fill:
    label: Fill
    control: color
  radius:
    label: Corner radius
    control: number
</studio>
