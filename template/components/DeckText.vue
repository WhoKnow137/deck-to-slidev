<script setup>
import {computed} from 'vue'

const props=defineProps({
  fontFamily:{type:String,default:'Inter Tight'},
  fontSize:{type:Number,default:32},
  fontWeight:{type:Number,default:400},
  fontStyle:{type:String,default:'normal'},
  color:{type:String,default:'#fff'},
  lineHeight:{type:String,default:'1.2'},
  letterSpacing:{type:String,default:'0'},
  wordSpacing:{type:String,default:'0'},
  align:{type:String,default:'left'},
  verticalAlign:{type:String,default:'top'},
  decoration:{type:String,default:'none'},
  textTransform:{type:String,default:'none'},
})
const typography=computed(()=>({
  fontFamily:`'${props.fontFamily.replaceAll("'",'')}', sans-serif`,
  fontSize:`${props.fontSize}px`,
  fontWeight:props.fontWeight,
  fontStyle:props.fontStyle,
  color:props.color,
  lineHeight:props.lineHeight,
  letterSpacing:props.letterSpacing,
  wordSpacing:props.wordSpacing,
  textAlign:props.align,
  textDecoration:props.decoration,
  textTransform:props.textTransform,
  whiteSpace:'pre-wrap',
  overflowWrap:'normal',
  display:props.verticalAlign==='top'?'block':'flex',
  alignItems:props.verticalAlign==='bottom'?'flex-end':props.verticalAlign==='center'?'center':undefined,
  justifyContent:props.verticalAlign==='top'?undefined:props.align==='center'?'center':props.align==='right'?'flex-end':'flex-start',
}))
</script>

<template>
  <div class="deck-text" :style="typography"><span class="deck-text-guard" style="display:none"></span><slot /></div>
</template>

<style>
.deck-text > span:not(.deck-text-guard) { display:inline-block; }
</style>

<studio lang="yaml">
description: Editable Figma text box
category: Deck objects
props:
  fontFamily:
    label: Font family
    control: text
  fontSize:
    label: Font size
    control: number
  fontWeight:
    label: Font weight
    control: number
  fontStyle:
    label: Font style
    options: [normal, italic, oblique]
  color:
    label: Text color
    control: color
  lineHeight:
    label: Line height
    control: text
  letterSpacing:
    label: Letter spacing
    control: text
  wordSpacing:
    label: Word spacing
    control: text
  align:
    label: Horizontal alignment
    options: [left, center, right, justify]
  verticalAlign:
    label: Vertical alignment
    options: [top, center, bottom]
  decoration:
    label: Decoration
    options: [none, underline, line-through]
  textTransform:
    label: Text case
    options: [none, uppercase, lowercase, capitalize]
</studio>
