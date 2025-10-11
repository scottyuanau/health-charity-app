import { createRouter, createWebHistory } from 'vue-router'
import { authReady, isAuthenticated } from '../composables/auth'
import HomeView from '../views/HomeView.vue'
import CarersView from '../views/CarersView.vue'
import FindSupportView from '../views/FindSupportView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/carers',
      name: 'carers',
      component: CarersView,
    },
    {
      path: '/find-support',
      name: 'find-support',
      component: FindSupportView,
    },
    {
      path: '/carers/:id',
      name: 'carer-profile',
      component: () => import('../views/CarerProfileView.vue'),
      props: true,
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/SignInView.vue'),
    },
    {
      path:'/dashboard',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/AboutView.vue'),
    }
  ],
})

router.beforeEach(async (to) => {
  await authReady

  if (to.meta.requiresAuth && !isAuthenticated.value) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
})

export default router
