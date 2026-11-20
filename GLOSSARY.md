# Cadence

An online course platform: Instructors publish Courses, Students buy and take them, alone or through a Team.

## People

**User**:
Any person with a login on the platform.
_Avoid_: Account, Customer

**Student**:
A User who takes Courses.
_Avoid_: Learner

**Instructor**:
A User who creates and teaches Courses.

**Course Owner**:
The Instructor who teaches a specific Course, as opposed to any Instructor.

**Admin**:
A User who runs the platform. Always the platform role, never a Team role.

**Buyer**:
The User who made a Purchase. May not be enrolled themselves, e.g. a Team Admin buying Seats.
_Avoid_: Purchaser, Customer

## Catalog

**Course**:
The product sold on the platform, made of Modules. Moves through Draft → Published → Archived.

**Module**:
An ordered group of Lessons within a Course.
_Avoid_: Section, Chapter, Unit

**Lesson**:
The smallest unit of Course content.

**Quiz**:
An optional set of questions attached to a Lesson.

## Commerce

**Purchase**:
A payment for a Course, either for the Buyer themselves or for a number of Seats.
_Avoid_: Order, Payment, Transaction

**PPP**:
Purchasing Power Parity: a price discount based on the Buyer's country.

**PPP Tier**:
The band a country falls into, setting the PPP discount (0%, 30%, 50% or 70%).

**PPP Lock**:
The rule that a Course bought at a PPP discount only grants Access, and its Seats can only be Claimed, from the country it was bought in. Purchases with no discount are not locked.

**Refund Request**:
A Buyer's ask to get their money back for a Purchase, with a reason in their own words. Is pending, approved or declined, and only an Admin decides. A Purchase gets at most one; a decline is final.
_Avoid_: Cancellation, Reversal, Chargeback

**Refund Window**:
The conditions under which a Buyer may make a Refund Request: within 14 days of the Purchase, less than 2 hours of Watch Time, and less than half the Lessons completed. All three must hold. A Purchase of Seats is only refundable while none of its Seats has been Claimed.

**Refund**:
Money returned to a Buyer, which exists only once a Refund Request is approved. Always the amount actually paid, and it ends the Enrollment.
_Avoid_: Cancellation, Reversal, Chargeback

**Revenue**:
The total amount of all Purchases of a Course.
_Avoid_: Gross revenue

**Platform Fee**:
The 20% share of Revenue the platform keeps.

**Earnings**:
What the Course Owner keeps: Revenue minus the Platform Fee minus Refunds.
_Avoid_: Net earnings

**Chargeback**:
A Buyer disputing a payment through their bank. Not something the platform handles; never use it to mean a Refund.

## Teams

**Team**:
A group of Users who share Seats bought by one of them.

**Team Admin**:
The one member of a Team who buys and manages its Seats: whoever made the Team's first Purchase.

**Team Member**:
A User in a Team who is not its Team Admin.

**Seat**:
One place in a Course bought on behalf of a Team, carrying a code that one Student can Claim.
_Avoid_: Coupon, Licence

**Claim**:
A Student using a Seat's code to get an Enrollment.
_Avoid_: Redeem, Mint

## Learning

**Enrollment**:
A Student's right to take a Course, gained from their own Purchase or by Claiming a Seat.

**Access**:
Whether a User can view a Course's Lessons right now. Depends on Enrollment, the PPP Lock, and whether they are the Course Owner or an Admin.

**Watch Time**:
How much of a Course's video a Student has watched: the furthest point reached in each Lesson's video, added up across Lessons.

**Completed**:
A Course is Completed for a Student when every one of its Lessons is completed. Quizzes do not count.
