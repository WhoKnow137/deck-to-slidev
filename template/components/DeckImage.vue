<script setup>
import {computed} from 'vue'
const props=defineProps({
  src:{type:String,required:true},
  alt:{type:String,default:''},
  kind:{type:String,default:'image'},
  fit:{type:String,default:'cover'},
  mediaStyle:{type:Object,default:()=>({})},
})
const imageStyle=computed(()=>({...props.mediaStyle,objectFit:props.fit}))
</script>
<template>
  <div class="deck-image"><img :src="src" :alt="alt" :style="imageStyle" draggable="false" /></div>
</template>
<style scoped>
.deck-image { overflow:hidden; }
.deck-image img { display:block; max-width:none; max-height:none; margin:0; padding:0; }
</style>
<studio lang="yaml">
description: Original image or animated GIF from Figma
category: Deck objects
props:
  src:
    label: Image source
    control: text
  alt:
    label: Description
    control: text
  fit:
    label: Fit
    options: [cover, contain, fill]
</studio>
