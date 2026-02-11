# دليل التوسع الأفقي (Horizontal Scaling)

هذا الدليل يشرح كيفية توسيع تطبيق ساحات المحاورة للتعامل مع أعداد كبيرة من المستخدمين.

## البنية الحالية

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Mobile App    │────▶│   API Server    │────▶│    Database     │
│   (Expo Go)     │     │   (Express +    │     │    (MySQL)      │
│                 │◀────│   Socket.io)    │◀────│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## البنية الموصى بها للإنتاج

```
                                    ┌─────────────────┐
                                    │   Redis Cluster │
                                    │   (Pub/Sub +    │
                                    │    Caching)     │
                                    └────────┬────────┘
                                             │
┌─────────────────┐     ┌─────────────────┐  │  ┌─────────────────┐
│   Mobile App    │────▶│  Load Balancer  │──┼─▶│  MySQL Primary  │
│   (Expo Go)     │     │   (Nginx/ALB)   │  │  │                 │
│                 │◀────│                 │  │  └────────┬────────┘
└─────────────────┘     └────────┬────────┘  │           │
                                 │           │  ┌────────▼────────┐
                        ┌────────┼────────┐  │  │  MySQL Replica  │
                        │        │        │  │  │   (Read-only)   │
                        ▼        ▼        ▼  │  └─────────────────┘
                   ┌─────────┬─────────┬─────────┐
                   │ Server  │ Server  │ Server  │
                   │   #1    │   #2    │   #3    │
                   └─────────┴─────────┴─────────┘
```

## خطوات التوسع

### 1. إضافة Redis للتخزين المؤقت وPub/Sub

```bash
# تثبيت Redis client
pnpm add ioredis

# إعداد متغيرات البيئة
REDIS_URL=redis://localhost:6379
```

**تحديث cache.ts:**
```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// استبدال InMemoryCache بـ Redis
export const cache = {
  async set(key: string, value: any, ttl: number) {
    await redis.setex(key, ttl, JSON.stringify(value));
  },
  async get(key: string) {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  },
  async delete(key: string) {
    await redis.del(key);
  }
};
```

### 2. تكوين Socket.io للعمل مع عدة خوادم

```bash
# تثبيت Redis adapter
pnpm add @socket.io/redis-adapter
```

**تحديث socket.ts:**
```typescript
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

### 3. إعداد Load Balancer

**Nginx Configuration:**
```nginx
upstream api_servers {
    ip_hash;  # للحفاظ على جلسات WebSocket
    server server1:3000;
    server server2:3000;
    server server3:3000;
}

server {
    listen 80;
    
    location / {
        proxy_pass http://api_servers;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### 4. تقسيم قاعدة البيانات (Database Sharding)

للأعداد الكبيرة جداً (> 1 مليون مستخدم):

```typescript
// تقسيم حسب roomId
function getShardId(roomId: number): number {
  return roomId % NUM_SHARDS;
}

// اتصال بالـ shard المناسب
const connections = [
  createConnection(SHARD_0_URL),
  createConnection(SHARD_1_URL),
  createConnection(SHARD_2_URL),
];

function getConnection(roomId: number) {
  return connections[getShardId(roomId)];
}
```

## تقديرات الأداء

| عدد المستخدمين | الخوادم المطلوبة | Redis | قاعدة البيانات |
|----------------|------------------|-------|----------------|
| 1,000 | 1 | اختياري | MySQL واحد |
| 10,000 | 2-3 | مطلوب | MySQL واحد |
| 100,000 | 5-10 | مطلوب | MySQL + Replica |
| 1,000,000+ | 20+ | Cluster | MySQL Sharded |

## مراقبة الأداء

### المقاييس المهمة

1. **وقت الاستجابة (Latency)**
   - API: < 100ms
   - WebSocket: < 50ms

2. **الاتصالات المتزامنة**
   - WebSocket connections per server: < 10,000

3. **استخدام الذاكرة**
   - Server memory: < 80%
   - Redis memory: < 70%

4. **استعلامات قاعدة البيانات**
   - Query time: < 50ms
   - Connections: < 100 per server

### أدوات المراقبة الموصى بها

- **Prometheus + Grafana**: للمقاييس
- **ELK Stack**: للـ logs
- **Sentry**: لتتبع الأخطاء
- **New Relic / Datadog**: للمراقبة الشاملة

## قائمة التحقق قبل الإنتاج

- [ ] إعداد Redis للتخزين المؤقت
- [ ] تكوين Socket.io مع Redis adapter
- [ ] إعداد Load Balancer
- [ ] تفعيل HTTPS
- [ ] إعداد Database Replica
- [ ] تكوين Auto-scaling
- [ ] إعداد Health checks
- [ ] تفعيل المراقبة والتنبيهات
- [ ] اختبار الحمل (Load testing)
- [ ] خطة التعافي من الكوارث

## الموارد

- [Socket.io Scaling](https://socket.io/docs/v4/using-multiple-nodes/)
- [Redis Documentation](https://redis.io/documentation)
- [MySQL Replication](https://dev.mysql.com/doc/refman/8.0/en/replication.html)
- [Kubernetes for Beginners](https://kubernetes.io/docs/tutorials/)
