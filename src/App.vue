<script setup>
import zhCN from 'ant-design-vue/es/locale/zh_CN'
const theme = { token: { colorPrimary: '#1677ff', borderRadius: 9, fontFamily: '"PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif', colorText: '#24324b', colorBorder: '#e5eaf2', colorBgLayout: '#f4f7fb' }, components: { Button: { controlHeight: 38 }, Table: { headerBg: '#fafbfd', rowHoverBg: '#f4f8ff', headerColor: '#8a96a8' }, Modal: { borderRadiusLG: 14 } } }
</script>

<template><a-config-provider :locale="zhCN" :theme="theme"><router-view /></a-config-provider></template>
