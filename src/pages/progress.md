PartsWale — Full Remaining Task List
Grounded in actual FLOW.json (133 nodes), main.py, Supabase tables, and system design

Current progress snapshot (updated from codebase)
* Rider web app core screens are built: login, dashboard, request, active order, capture, earnings, profile.
* Supabase Edge Function integration is active for OTP login, dashboard, online toggle, accept/decline, pickup/delivery arrival, photo confirmation, upload URL, and delivery OTP completion.
* Pending rider request refresh is implemented in-app using Supabase orders where status = pending_rider, rider_id is null, normalized district match, and Haversine radius filtering.
* Pickup flow is implemented with rider arrival, checklist, pickup photo, and dealer handoff confirmation wait.
* Delivery flow is implemented with rider arrival, delivery photo, mechanic OTP generation/send, rider OTP entry, completion, and completion/review notifications.
* Remaining major work: deploy the latest local Edge Function source where needed, payout settlement automation, dispute flow, rating response handling, rider pooling, assignment timers/escalation, and edge-case automation.

SECTION 1 — DATABASE (Supabase) ( DONE )
Task 1.1 — Create riders table
Fields to add:
* id UUID primary key
* name TEXT
* phone TEXT unique
* district TEXT
* vehicle_type TEXT (bike/cycle/etc.)
* is_active BOOLEAN default true
* is_online BOOLEAN default false
* lat FLOAT (last known latitude)
* lng FLOAT (last known longitude)
* location_updated_at TIMESTAMP
* rating FLOAT default 0
* total_deliveries INT default 0
* completed_deliveries INT default 0
* earnings_pending FLOAT default 0
* earnings_total FLOAT default 0
* created_at TIMESTAMP
* conversation JSONB (for WhatsApp bot context if rider is on WhatsApp too)
Task 1.2 — Update orders table schema
Add missing fields:
* rider_id UUID (foreign key to riders)
* status TEXT — enum: pending_rider → rider_assigned → rider_at_pickup → picked_up → in_transit → rider_at_delivery → delivered → disputed → completed → cancelled
* pickup_photo_id UUID (reference to photos table)
* delivery_photo_id UUID (reference to photos table)
* pickup_confirmed_at TIMESTAMP
* delivery_confirmed_at TIMESTAMP
* dealer_confirmed_handoff BOOLEAN default false
* mechanic_confirmed_receipt BOOLEAN default false
* auto_confirm_at TIMESTAMP (set to +4hr from delivery photo time)
* dispute_raised_at TIMESTAMP
* dealer_paid_at TIMESTAMP
* rider_paid_at TIMESTAMP
* dealer_lat FLOAT, dealer_lng FLOAT (copied from dealer at order time)
* mechanic_lat FLOAT, mechanic_lng FLOAT (copied from mechanic at order time)
* delivery_otp TEXT (generated after delivery photo, used by rider to complete order)
Task 1.3 — Create photos table
Fields:
* id UUID primary key
* order_id UUID foreign key
* rider_id UUID foreign key
* type TEXT — pickup or delivery
* image_url TEXT (Supabase storage URL)
* lat FLOAT
* lng FLOAT
* captured_at TIMESTAMP
* device_ip TEXT
* validated BOOLEAN default false
* created_at TIMESTAMP
Task 1.4 — Structure rider_active_jobs table properly
Fields:
* id UUID
* rider_id UUID
* order_ids UUID[] (array of pooled order IDs)
* current_status TEXT
* sequence JSONB (ordered delivery sequence set at assignment time)
* started_at TIMESTAMP
* updated_at TIMESTAMP
Task 1.5 — Add location fields to users table
For dealers and mechanics:
* lat FLOAT
* lng FLOAT
* location_updated_at TIMESTAMP
(Needed for geo-fence validation and nearest-rider search)

SECTION 2 — RIDER WEB APP (Mobile Web, hosted on Netlify)
Task 2.1 — Set up subdomain
* Create subdomain: rider.partswale.in on Netlify
* Connect to a GitHub repo for the rider web app
* Set up auto-deploy on push
Task 2.2 — Build Rider Login Page ( DONE )
Page: /login
UI elements:
* Phone number input
* Send OTP button → triggers n8n webhook → sends OTP via WhatsApp or SMS
* OTP input field
* Verify button → calls /verify-otp webhook → returns JWT or session token
* Store token in sessionStorage (not localStorage — not supported in artifacts)
Backend (n8n webhooks needed):
* POST /rider-send-otp — generate OTP, store in Supabase riders row temporarily, send via WhatsApp
* POST /rider-verify-otp — validate OTP, return session token
* Rider must exist in riders table; if not, show "Not registered" error (no self-signup for riders)
Task 2.3 — Build Rider Home / Dashboard Page ( DONE )
Page: /dashboard
Shows:
* Rider name, district, online/offline toggle
* Active job card (if assigned): order summary, pickup address, current status
* Pending requests list (incoming delivery requests not yet accepted)
* Today's completed deliveries count + earnings
Online/Offline toggle:
* When toggled ON: calls n8n webhook to set riders.is_online = true
* When toggled OFF: sets is_online = false, stops GPS pings
* GPS pings only active when online AND time is 10AM–6PM (or active job extends beyond 6PM)
Task 2.4 — Build Incoming Request Screen ( DONE )
Page: /request/:order_id
Shows:
* Items list (from order)
* Pickup location (dealer shop name + area)
* Drop location (mechanic shop name + area)
* Estimated distance
* Accept button (with 3-minute countdown timer)
* Decline button
On Accept:
* Calls n8n webhook POST /rider-accept-order
* Sets order status to rider_assigned
* Redirects to Order Detail page
On Decline or timeout:
* Calls POST /rider-decline-order
* Returns to dashboard
Task 2.5 — Build Order Detail Page ( DONE )
Page: /order/:order_id
Shows current step of order with clear step indicator:
1. Go to Pickup (dealer address + Google Maps link)
2. Arrive at Pickup → geo-fence check → trigger photo tool
3. Confirm pickup items + take pickup photo
4. Wait for dealer handoff confirmation
5. Go to Delivery (mechanic address + Google Maps link)
6. Arrive at Delivery → geo-fence check → trigger photo tool
7. Delivery photo confirmed → enter mechanic OTP
8. OTP matched → order completed
Each step only unlocks when the previous is confirmed.
Task 2.6 — Build Photo Capture Tool (Critical) ( MOSTLY DONE )
Page: /capture/:order_id/:type where type = pickup or delivery
Flow:
1. Page opens camera using getUserMedia API
2. Shows live viewfinder
3. Rider taps "Capture" — photo is taken
4. App fetches rider's latest lat/lng from riders DB record instead of browser geolocation
5. Sends metadata separately: lat, lng, timestamp, order_id, rider_id
6. Uploads photo to Supabase storage via upload URL flow
7. On Send: calls Supabase Edge Function rider-confirm-photo
8. Edge Function validates: GPS within 50m of expected location, photo timestamp window, and order status
9. If valid: saves photos record, updates order fields/status, notifies other party
10. If invalid: shows error "Aap sahi jagah par nahi hain" and does not proceed
Embedded metadata in image (written as EXIF UserComment or a watermark):
* photo_id
* order_id
* lat, lng
* captured_at ISO timestamp
* rider_id
Pending:
* EXIF/watermark embedding is not implemented; metadata is sent as separate payload and stored in DB.
Task 2.7 — GPS Ping System ( DONE )
On the rider web app, when online:
* Current rider web app reads rider location from DB and refreshes based on riders.location_updated_at
* External GPS/logger or backend process is expected to update riders.lat, riders.lng, riders.location_updated_at
* Only active between 10AM–6PM, OR if rider has an active job (no time limit then)
* Browser geolocation reads were intentionally removed from the web app

SECTION 3 — RIDER ASSIGNMENT SYSTEM (n8n / Supabase Edge) ( PARTIAL )
Task 3.1 — Trigger on Order Created
After checkout_auth creates the order in DB:
* Set order status = pending_rider
* Trigger rider search flow
Task 3.2 — Find Nearest Available Riders (n8n webhook) ( PARTIAL )
Webhook: POST /find-riders
Logic:
* Query riders table: is_online = true, is_active = true, district = order.district
* Calculate distance from each rider's lat/lng to dealer's lat/lng using Haversine formula (in a Code node)
* Sort by distance ascending
* Take top 3 riders as candidates
* If no riders online → notify mechanic "Koi rider available nahi hai abhi, thodi der mein try karenge"
Current implementation:
* Rider dashboard can refresh and list pending_rider orders directly from Supabase using district match + 20km Haversine radius.
* Automatic top-3 candidate notification/timer flow is still pending.
Task 3.3 — Send Delivery Request to Riders
For each candidate rider (in sequence, not all at once):
* Send WhatsApp message OR web push notification to rider with order summary and accept/decline buttons
* Set a 3-minute timer per rider
* If no response in 3 minutes → move to next candidate
* If all 3 decline → widen radius to next district, repeat
* If still no rider after 15 minutes → escalate, notify mechanic
Task 3.4 — Rider Accepts → Order Assigned ( DONE FOR DIRECT ACCEPT )
Supabase Edge Function: POST /rider-accept-order
Steps:
* Set orders.rider_id = rider_id
* Set orders.status = rider_assigned
* Notify dealer: "Rider aa raha hai pickup ke liye. Items ready rakhein."
* Notify mechanic: "Rider assign ho gaya hai. Items jald deliver honge."
* Cancel pending requests to other candidate riders
Pending:
* Cancel pending requests to other candidate riders depends on final candidate/request schema.
Task 3.5 — Order Pooling Logic
When assigning a rider:
* Check if this rider already has active jobs in rider_active_jobs
* If existing jobs: check if pickup locations are within 1km of each other AND delivery locations are within 2km of each other
* If yes: add to existing rider_active_jobs record, update sequence (optimized delivery order)
* If no: create new rider_active_jobs record
* Maximum 3 orders per pool per rider at a time

SECTION 4 — PICKUP FLOW (Supabase Edge) ( PARTIAL / LIVE )
Task 4.1 — Rider Arrives at Dealer (Geo-fence Check) ( DONE )
Supabase Edge Function: POST /rider-at-pickup
Input: rider_id, order_id, lat, lng
Logic:
* Fetch dealer's lat/lng from order
* Calculate distance between rider and dealer
* If within 50 meters: unlock photo capture step on rider web app, update status to rider_at_pickup
* If not within 50m: return error, do not unlock
Task 4.2 — Dealer Confirms Handoff ( PARTIAL )
After pickup photo, dealer receives WhatsApp interactive confirmation:
* Message asks dealer to confirm all items were handed over.
* Button ID includes confirm_handoff_{order_id}.
Pending:
* The inbound WhatsApp handler that receives the button tap and sets orders.dealer_confirmed_handoff = true / status = picked_up must exist outside the rider app.
Task 4.3 — Rider Takes Pickup Photo + Confirms Item Count ( MOSTLY DONE )
Rider opens photo capture tool from web app:
* Takes photo (must be within 50m geo-fence)
* Confirms item count matches order (simple checklist on web app)
* Submits photo
Supabase Edge Function: POST /rider-confirm-photo with type = pickup
Validations:
* Photo GPS within 50m of dealer location
* Photo timestamp within last 2 minutes
* Item count confirmed
If all pass:
* Save photos record
* Set orders.pickup_photo_id
* Send dealer handoff confirmation prompt
Pending:
* Final status change to picked_up is expected after dealer confirmation handler.

SECTION 5 — DELIVERY FLOW (Supabase Edge) ( MOSTLY DONE )
Task 5.1 — Rider Arrives at Mechanic (Geo-fence Check) ( DONE )
Supabase Edge Function: POST /rider-at-delivery
Input: rider_id, order_id, lat, lng
Logic:
* Fetch mechanic's lat/lng
* If within 50m: unlock delivery photo step, set status to rider_at_delivery
* Notify mechanic: "Rider aapke paas aa gaya hai."
Task 5.2 — Rider Takes Delivery Photo ( DONE )
Same photo capture tool, type = delivery
Validations:
* GPS within 50m of mechanic location
* Timestamp within last 2 minutes
If valid:
* Save photos record
* Set orders.delivery_photo_id, orders.status = delivered, orders.delivery_confirmed_at
* Set orders.auto_confirm_at = now + 4 hours
* Generate orders.delivery_otp
* Send mechanic OTP message: rider delivered order; give OTP to rider after confirming items
Task 5.3 — Mechanic OTP Validation (DONE FOR HAPPY PATH)
Mechanic receives delivery OTP by WhatsApp.
Rider enters OTP in active order page.
Supabase Edge Function: POST /rider-complete-delivery
If OTP matches:
* Set orders.mechanic_confirmed_receipt = true
* Set orders.status = completed
* Set orders.delivery_confirmed_at and delivered_at
* Send completion messages to rider, dealer, and mechanic
* Send mechanic dealer-review prompt with 1-5 star list and dealer ID
* Append sent messages into users.conversation and riders.conversation
If Issue Hai:
* Ask: "Kya issue hai?" with buttons: Wrong Part, Missing Item, Damaged, Wrong Quality
* Set orders.status = disputed, orders.dispute_raised_at = now
* Freeze payment
* Notify dealer and create support ticket
Pending:
* Issue Hai/dispute path is not implemented in the rider app.
Task 5.4 — Auto-Confirm Timer (Fallback)
n8n scheduled check every 30 minutes:
* Query orders where status = delivered AND auto_confirm_at < now AND mechanic_confirmed_receipt = false AND dispute_raised_at IS NULL
* For each: set status = completed, trigger payment release
* Log as auto-confirmed
Current status:
* auto_confirm_at is set on delivery photo, but scheduled auto-confirm worker is not implemented.

SECTION 6 — PAYMENT RELEASE (n8n) ( NOT DONE / MESSAGES PARTIAL )
Task 6.1 — Dealer Payment Release (24hr after completion)
On order status = completed:
* Schedule a 24-hour delayed trigger (use n8n wait node or a scheduled DB check)
* After 24hr: add order amount (minus platform commission) to dealer's earnings_pending
* Update orders.dealer_paid_at
* Send dealer WhatsApp: "₹X aapke payout mein add ho gaya. Agle Monday ko bank transfer hoga."
Commission deduction: define platform % (e.g. 5-10%) before building this.
Task 6.2 — Rider Payment Release (24hr after completion)
Same trigger as dealer:
* After 24hr: add rider delivery fee to riders.earnings_pending
* Update orders.rider_paid_at
* Send rider WhatsApp or web app notification: "₹X aapki earnings mein add hua."
Define rider delivery fee structure before building (flat fee per delivery vs distance-based).
Current status:
* Completion messages mention pending payout/settlement timing.
* Actual earnings_pending updates, paid_at updates, Razorpay payouts, and scheduled settlement are pending.
Task 6.3 — Weekly Payout Batch (n8n Scheduled)
Every Monday at 9AM:
* Query all riders and users (dealers) where earnings_pending > 0
* Initiate Razorpay Payout API call for each
* On success: move earnings_pending to earnings_total, set earnings_pending = 0
* Notify each person via WhatsApp

SECTION 7 — DISPUTE / SUPPORT SYSTEM (n8n)
Task 7.1 — Create disputes table in Supabase
Fields:
* id UUID
* order_id UUID
* raised_by TEXT (mechanic/dealer/rider)
* reason TEXT
* status TEXT (open/resolved/escalated)
* resolution TEXT
* created_at, resolved_at TIMESTAMP
Task 7.2 — Dispute Flow in WhatsApp Bot
Already partially planned in agent prompts. Wire it:
* On mechanic selecting issue type → insert disputes row
* Notify support team (email or Slack via n8n)
* Freeze order payment
* Auto-resolve if no response from support in 48hr (mechanic's favour for safety)
Task 7.3 — Support Notification (n8n)
When dispute created:
* Send email or Slack message to support team with order details, photos, and issue type
* Include links to both pickup and delivery photos

SECTION 8 — RATING SYSTEM (n8n + WhatsApp) ( PARTIAL )
Task 8.1 — Rate Dealer (after order completed) ( PROMPT DONE, RESPONSE HANDLER PENDING )
After status = completed, send mechanic: "Dealer ko rate karein (1-5):" with list options ⭐, ⭐⭐, ⭐⭐⭐, ⭐⭐⭐⭐, ⭐⭐⭐⭐⭐
On selection:
* Update users.rating for dealer (rolling average)
* Append to users.all_ratings
Current status:
* rider-complete-delivery sends the dealer review prompt with 1-5 star options and dealer ID.
* The inbound WhatsApp handler that processes the selected rating and updates users.rating/all_ratings is pending.
Task 8.2 — Rate Rider (after order completed)
Same timing, send mechanic: "Rider ko rate karein (1-5):"
On selection:
* Update riders.rating
Current status:
* Rider rating prompt/handler is pending.

SECTION 9 — EDGE CASE HANDLERS (n8n)
Task 9.1 — Rider No-Show at Pickup
If rider is assigned but does not reach geo-fence within 45 minutes:
* Auto-cancel rider assignment
* Set order back to pending_rider
* Restart rider search
* Penalize rider (flag in DB, affects future assignment priority)
Task 9.2 — Rider Goes Offline Mid-Delivery
Detect via GPS ping gap > 15 minutes when order is picked_up:
* Alert support
* Contact rider via WhatsApp: "Aap offline ho gaye, status update karein"
* If no response in 30 minutes: escalate to support as potential lost order
Task 9.3 — Delivery Timeout
If order stays in picked_up status for more than 3 hours:
* Auto-flag as delayed
* Notify mechanic and support
* Do not auto-complete; require manual resolution
Task 9.4 — Order Cancellation Before Rider Pickup
If mechanic or dealer cancels after payment but before pickup:
* Trigger Razorpay refund API
* Set order status = cancelled
* Release rider from job
* Notify all parties

SECTION 10 — LOCATION DATA FOR USERS (n8n + Registration)
Task 10.1 — Collect Dealer and Mechanic Location at Registration
During registration webhook:
* Accept lat and lng fields from the registration form/payload
* Save to users table
OR — add a one-time location update flow in the WhatsApp bot:
* "Apni shop ki location share karein" → WhatsApp location message → extract lat/lng → save to DB
Task 10.2 — Location Update Option in Shop Settings
Add to dealer agent: Shop Settings → Update Location
* Prompt: "Apni nayi location bhejein"
* Accept WhatsApp location pin → update users.lat, users.lng

SECTION 11 — TESTING CHECKLIST
Task 11.1 — End-to-End Order Flow Test
* [ ] Mechanic registers
* [ ] Mechanic requests a part
* [ ] Dealer receives broadcast
* [ ] Dealer submits quote
* [ ] Mechanic sees quote, accepts, pays
* [ ] Order created in DB with pending_rider
* [x] Rider sees/refreshes pending_rider request in web app
* [x] Rider accepts direct pending request
* [x] Rider arrives at dealer (geo-fence triggers)
* [ ] Dealer confirms handoff via inbound WhatsApp handler
* [x] Rider takes pickup photo → validation passes
* [ ] Order updates to picked_up after dealer confirmation handler
* [x] Rider arrives at mechanic (geo-fence triggers)
* [x] Rider takes delivery photo → validation passes
* [x] Mechanic receives delivery OTP
* [x] Rider enters OTP → order moves to completed
* [x] Completion/review messages are sent by rider-complete-delivery source
* [ ] 24hr later: dealer and rider earnings updated
* [ ] Monday: payouts processed
Task 11.2 — Edge Case Tests
* [ ] Rider declines → next rider gets request
* [ ] All riders decline → mechanic notified
* [ ] Photo GPS outside 50m → rejected
* [ ] Mechanic raises dispute → payment freezes
* [ ] Mechanic doesn't respond in 4hr → auto-confirms
* [ ] Rider goes offline mid-delivery → alert triggered
Task 11.3 — Load Tests
* Multiple simultaneous orders in same district
* Multiple dealers bidding on same request
* Rider with 3 pooled orders completing sequentially

PRIORITY ORDER (Recommended Build Sequence)
1. DB schema updates (Section 1) — everything depends on this
2. Location collection at registration (Task 10.1) — needed for rider search
3. Rider table + registration (Task 1.1 + partial Section 2)
4. Rider web app: Login + Dashboard (Task 2.2, 2.3)
5. Rider assignment system in n8n (Section 3)
6. Pickup flow (Section 4)
7. Photo capture tool (Task 2.6) — most complex frontend piece
8. Delivery flow (Section 5)
9. Open-box validation + auto-confirm (Task 5.3, 5.4)
10. Payment release (Section 6)
11. Rating system (Section 8)
12. Dispute system (Section 7)
13. Edge case handlers (Section 9)
14. Full E2E testing (Section 11)
