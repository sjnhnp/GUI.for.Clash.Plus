<script lang="ts" setup>
import { ref, computed, isVNode, h, onMounted, onUnmounted, watch } from 'vue'

import vMenu from '@/directives/menu'
import useI18n from '@/lang'
import { getValue } from '@/utils'

import type { Menu } from '@/types/app'

export type Column = {
  title: string
  key: string
  align?: 'center' | 'left' | 'right'
  hidden?: boolean
  minWidth?: string
  sort?: (a: Record<string, any>, b: Record<string, any>) => number
  customRender?: (v: { value: any; record: Record<string, any> }) => any
}

interface Props {
  menu?: Menu[]
  columns: Column[]
  dataSource: Record<string, any>[]
  sort?: string
  rowHeight?: number // Row height for virtual scrolling
  virtualThreshold?: number // Enable virtual scrolling when data exceeds this count
}

const props = withDefaults(defineProps<Props>(), {
  menu: () => [],
  sort: undefined,
  rowHeight: 36,
  virtualThreshold: 100,
})

const sortField = ref(props.sort)
const sortReverse = ref(true)
const sortFunc = computed(
  () => props.columns.find((column) => column.key === sortField.value)?.sort,
)

const { t } = useI18n.global

const handleChangeSortField = (field: string) => {
  if (sortField.value === field) {
    if (sortReverse.value) {
      sortReverse.value = false
      return
    }
    sortField.value = ''
    sortReverse.value = true
    return
  }
  sortField.value = field
  sortReverse.value = true
}

const tableData = computed(() => {
  if (!sortField.value || !sortFunc.value) return props.dataSource
  const sorted = props.dataSource.slice().sort(sortFunc.value)
  if (sortReverse.value) sorted.reverse()
  return sorted
})

const tableColumns = computed(() => {
  return props.columns.filter((column) => !column.hidden)
})

const renderCell = (column: Column, record: Recordable) => {
  const value = getValue(record, column.key)
  let result = column.customRender?.({ value, record }) ?? value ?? '-'
  if (!isVNode(result)) {
    result = h('div', String(result))
  }
  return result
}

// Virtual scrolling logic
const containerRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const containerHeight = ref(400)

const useVirtualScroll = computed(() => tableData.value.length > props.virtualThreshold)

const visibleRange = computed(() => {
  if (!useVirtualScroll.value) {
    return { start: 0, end: tableData.value.length }
  }
  
  const buffer = 5 // Extra rows to render for smooth scrolling
  const start = Math.max(0, Math.floor(scrollTop.value / props.rowHeight) - buffer)
  const visibleCount = Math.ceil(containerHeight.value / props.rowHeight) + buffer * 2
  const end = Math.min(tableData.value.length, start + visibleCount)
  
  return { start, end }
})

const visibleData = computed(() => {
  const { start, end } = visibleRange.value
  return tableData.value.slice(start, end).map((item, index) => ({
    ...item,
    __virtualIndex: start + index,
  }))
})

const totalHeight = computed(() => tableData.value.length * props.rowHeight)
const offsetY = computed(() => visibleRange.value.start * props.rowHeight)

const handleScroll = (e: Event) => {
  const target = e.target as HTMLElement
  scrollTop.value = target.scrollTop
}

const updateContainerHeight = () => {
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight
  }
}

onMounted(() => {
  updateContainerHeight()
  window.addEventListener('resize', updateContainerHeight)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateContainerHeight)
})

watch(() => props.dataSource.length, updateContainerHeight)
</script>

<template>
  <div ref="containerRef" class="gui-table overflow-auto" @scroll="handleScroll">
    <table class="w-full text-12 border-collapse">
      <thead>
        <tr class="sticky top-0 shadow" style="z-index: 1;">
          <th
            v-for="column in tableColumns"
            :key="column.key"
            class="px-4 py-8 whitespace-nowrap cursor-pointer"
          >
            <div
              :style="{
                justifyContent: { left: 'flext-start', center: 'center', right: 'flex-end' }[
                  column.align || 'left'
                ],
                minWidth: column.minWidth || 'auto',
              }"
              class="flex items-center"
              @click="handleChangeSortField(column.key)"
            >
              {{ t(column.title) }}
              <div v-if="sortField === column.key && sortFunc">
                <span class="px-4"> {{ sortReverse ? '↑' : '↓' }} </span>
              </div>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <!-- Virtual scrolling container -->
        <tr v-if="useVirtualScroll" :style="{ height: `${totalHeight}px`, position: 'relative' }">
          <td :colspan="tableColumns.length" style="padding: 0; position: relative;">
            <div :style="{ transform: `translateY(${offsetY}px)` }">
              <table class="w-full text-12 border-collapse">
                <tbody>
                  <tr
                    v-for="record in visibleData"
                    :key="(record as any).id"
                    v-menu="menu.map((v) => ({ ...v, handler: () => v.handler?.(record) }))"
                    :style="{ height: `${rowHeight}px` }"
                    :class="record.__virtualIndex % 2 === 0 ? 'virtual-row-even' : 'virtual-row-odd'"
                    class="transition duration-200"
                  >
                    <td
                      v-for="column in tableColumns"
                      :key="column.key"
                      :style="{ textAlign: column.align || 'left' }"
                      class="select-text whitespace-nowrap p-8"
                    >
                      <slot :name="column.key" :="{ column, record }">
                        <component :is="renderCell(column, record)" />
                      </slot>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </td>
        </tr>
        <!-- Standard rendering for small datasets -->
        <template v-else>
          <tr
            v-for="record in tableData"
            :key="record.id"
            v-menu="menu.map((v) => ({ ...v, handler: () => v.handler?.(record) }))"
            class="transition duration-200"
          >
            <td
              v-for="column in tableColumns"
              :key="column.key"
              :style="{ textAlign: column.align || 'left' }"
              class="select-text whitespace-nowrap p-8"
            >
              <slot :name="column.key" :="{ column, record }">
                <component :is="renderCell(column, record)" />
              </slot>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style lang="less" scoped>
table {
  thead {
    tr {
      background: var(--table-tr-odd-bg);
    }
  }
  tbody {
    tr {
      &:nth-child(odd) {
        background: var(--table-tr-odd-bg);
        &:hover {
          background: var(--table-tr-odd-hover-bg);
        }
      }
      &:nth-child(even) {
        background: var(--table-tr-even-bg);
        &:hover {
          background: var(--table-tr-even-hover-bg);
        }
      }
    }
    // Virtual scroll row styles
    .virtual-row-odd {
      background: var(--table-tr-odd-bg);
      &:hover {
        background: var(--table-tr-odd-hover-bg);
      }
    }
    .virtual-row-even {
      background: var(--table-tr-even-bg);
      &:hover {
        background: var(--table-tr-even-hover-bg);
      }
    }
  }
}
</style>

