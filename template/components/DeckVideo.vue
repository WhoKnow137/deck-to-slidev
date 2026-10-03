<script setup>
import {ref,onMounted,onBeforeUnmount,nextTick} from 'vue'
const props=defineProps({src:String,poster:String,mediaStyle:Object,playback:Object})
const video=ref(null),active=ref(false)
let observer
function play(){const v=video.value;if(!v)return;v.play().catch(()=>{})}
function toggle(event){event.stopPropagation();const v=video.value;if(!v)return;if(v.paused)play();else v.pause()}
function onTime(){const v=video.value,end=props.playback?.endTimeMs;if(v&&end>0&&v.currentTime>=end/1000){if(props.playback?.mediaLoop)v.currentTime=(props.playback?.startTimeMs??0)/1000;else v.pause()}}
onMounted(()=>{
  observer=new IntersectionObserver(entries=>{const v=video.value;if(!v)return
    active.value=!!entries[0]?.isIntersecting
    if(active.value){v.playbackRate=props.playback?.playbackRate??1;if(props.playback?.startTimeMs)try{v.currentTime=props.playback.startTimeMs/1000}catch{}
      if(props.playback?.autoplay)nextTick().then(()=>{if(active.value)play()})}
    else {v.pause();try{v.currentTime=(props.playback?.startTimeMs??0)/1000}catch{}}
  },{threshold:0.35})
  if(video.value)observer.observe(video.value)
})
onBeforeUnmount(()=>{observer?.disconnect();video.value?.pause()})
</script>
<template>
  <div class="deck-video">
    <video ref="video" :src="active ? src : undefined" :poster="poster" :style="mediaStyle"
      :muted="playback?.muted ?? true" :loop="playback?.mediaLoop ?? false"
      :controls="playback?.showControls ?? false" playsinline preload="none"
      disablepictureinpicture @click="toggle" @timeupdate="onTime" />
  </div>
</template>
<style scoped>
.deck-video { overflow:hidden; }
.deck-video video { display:block; max-width:none; max-height:none; margin:0; padding:0; }
</style>
<studio lang="yaml">
description: Original Figma video with poster and playback settings
category: Deck objects
props:
  src:
    label: Video source
    control: text
  poster:
    label: Poster image
    control: text
</studio>
