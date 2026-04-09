import Image from "next/image";

const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=100+South+Spooky+Lane+2D+Santa+Rosa+Beach+FL+32459";

export default function TripPage() {
  return (
    <article className="max-w-3xl space-y-6 text-teal-900/90">
      <h1 className="text-2xl font-semibold text-teal-950">Trip info</h1>

      <section className="space-y-5" aria-label="Photos of the property">
        <figure className="overflow-hidden rounded-2xl border-2 border-teal-200/70 bg-white shadow-md shadow-teal-900/10">
          <Image
            src="/trip/balcony-view.png"
            alt="View from the rental balcony over the dunes and white sand to the Gulf of Mexico, bright blue water under a sunny sky."
            width={1024}
            height={575}
            className="h-auto w-full object-cover"
            priority
            sizes="(max-width: 768px) 100vw, 768px"
          />
          <figcaption className="border-t border-teal-100/90 bg-gradient-to-b from-teal-50/90 to-amber-50/50 px-4 py-3 text-sm leading-relaxed text-teal-900/88">
            The view from the balcony—beach grass, dunes, and the Gulf a short
            walk away.
          </figcaption>
        </figure>
        <figure className="overflow-hidden rounded-2xl border-2 border-teal-200/70 bg-white shadow-md shadow-teal-900/10">
          <Image
            src="/trip/aerial-location.png"
            alt="Aerial view of the Santa Rosa Beach shoreline with the Gulf on west side and the beachfront building marked by a map pin."
            width={1024}
            height={574}
            className="h-auto w-full object-cover"
            sizes="(max-width: 768px) 100vw, 768px"
          />
          <figcaption className="border-t border-teal-100/90 bg-gradient-to-b from-teal-50/90 to-amber-50/50 px-4 py-3 text-sm leading-relaxed text-teal-900/88">
            From above: the pin marks our building on the dunes, just above the beach.
          </figcaption>
        </figure>
      </section>

      <p className="text-sm">
        <a
          className="font-medium text-teal-800 underline decoration-teal-400/50 underline-offset-2 hover:text-teal-950"
          href="https://www.vrbo.com/2806376"
          target="_blank"
          rel="noopener noreferrer"
        >
          VRBO listing (2806376)
        </a>
      </p>
      <p className="text-sm">
        <strong>Address:</strong>{" "}
        <a
          className="font-medium text-teal-800 underline decoration-teal-400/50 underline-offset-2 hover:text-teal-950"
          href={MAPS_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          100 South Spooky Lane 2D, Santa Rosa Beach, FL
        </a>
      </p>

      <h2 className="text-lg font-semibold text-teal-950">Getting here</h2>
      <ul className="list-inside list-disc space-y-2 text-sm">
        <li>
          <strong>VPS — Northwest Florida (Destin/Fort Walton Beach):</strong>{" "}
          often the most convenient option for this stretch of 30A (roughly a
          35–45 minute drive, traffic depending).
        </li>
        <li>
          <strong>ECP — Northwest Florida Beaches (Panama City):</strong>{" "}
          another good option; often about 45 minutes to an hour away.
        </li>
        <li>
          <strong>PNS — Pensacola</strong> is farther (~1.5+ hours) but
          sometimes has good fares or connections.
        </li>
      </ul>
      <p className="text-sm text-teal-800/90">
        <strong>Airport rides:</strong> we’re glad to help with{" "}
        <strong>pickup and dropoff</strong> runs when our schedules allow—just
        ask in the group message with your flight times so we can coordinate.
      </p>

      <h2 className="text-lg font-semibold text-teal-950">Nearby activities</h2>
      <ul className="list-inside list-disc space-y-2 text-sm">
        <li>
          <strong>Beaches &amp; water:</strong> Public beach accesses along 30A
          (Ed Walline, Gulfview Heights), Grayton Beach, Gulf swimming,
          sunsets.
        </li>
        <li>
          <strong>State parks:</strong>{" "}
          <a
            className="font-medium text-teal-800 underline decoration-teal-400/50 underline-offset-2 hover:text-teal-950"
            href="https://www.floridastateparks.org/parks-and-trails/grayton-beach-state-park"
            target="_blank"
            rel="noopener noreferrer"
          >
            Grayton Beach State Park
          </a>
          ,{" "}
          <a
            className="font-medium text-teal-800 underline decoration-teal-400/50 underline-offset-2 hover:text-teal-950"
            href="https://www.floridastateparks.org/parks-and-trails/topsail-hill-preserve-state-park"
            target="_blank"
            rel="noopener noreferrer"
          >
            Topsail Hill Preserve State Park
          </a>
          .
        </li>
        <li>
          <strong>Towns:</strong> Seaside, Rosemary Beach, Alys Beach — shops,
          dining, architecture.
        </li>
        <li>
          <strong>Eats close by (short drive / bike from our area):</strong>{" "}
          <a
            className="font-medium text-teal-800 underline decoration-teal-400/50 underline-offset-2 hover:text-teal-950"
            href="https://www.google.com/maps/search/?api=1&query=Stinky's+Fish+Camp+Santa+Rosa+Beach+FL"
            target="_blank"
            rel="noopener noreferrer"
          >
            Stinky’s Fish Camp
          </a>{" "}
          (seafood, laid-back),{" "}
          <a
            className="font-medium text-teal-800 underline decoration-teal-400/50 underline-offset-2 hover:text-teal-950"
            href="https://www.google.com/maps/search/?api=1&query=Red+Fish+Taco+Blue+Mountain+Beach+FL"
            target="_blank"
            rel="noopener noreferrer"
          >
            Red Fish Taco
          </a>{" "}
          (tacos &amp; patio),{" "}
          <a
            className="font-medium text-teal-800 underline decoration-teal-400/50 underline-offset-2 hover:text-teal-950"
            href="https://www.google.com/maps/search/?api=1&query=The+Surf+Hut+Santa+Rosa+Beach+FL"
            target="_blank"
            rel="noopener noreferrer"
          >
            The Surf Hut
          </a>{" "}
          (Gulf views, casual),{" "}
          <a
            className="font-medium text-teal-800 underline decoration-teal-400/50 underline-offset-2 hover:text-teal-950"
            href="https://www.google.com/maps/search/?api=1&query=Black+Bear+Bread+Co+Grayton+Beach+FL"
            target="_blank"
            rel="noopener noreferrer"
          >
            Black Bear Bread Co.
          </a>{" "}
          (bread, coffee, light fare in Grayton),{" "}
          <a
            className="font-medium text-teal-800 underline decoration-teal-400/50 underline-offset-2 hover:text-teal-950"
            href="https://www.google.com/maps/search/?api=1&query=Bud+and+Alley's+Seaside+FL"
            target="_blank"
            rel="noopener noreferrer"
          >
            Bud &amp; Alley’s
          </a>{" "}
          (Seaside institution),{" "}
          <a
            className="font-medium text-teal-800 underline decoration-teal-400/50 underline-offset-2 hover:text-teal-950"
            href="https://www.google.com/maps/search/?api=1&query=George's+at+Alys+Beach+FL"
            target="_blank"
            rel="noopener noreferrer"
          >
            George’s at Alys Beach
          </a>{" "}
          (upscale, reservation-friendly).
        </li>
        <li>
          <strong>More food &amp; drink:</strong> Gulf Place shops and eateries
          (pizza, coffee, casual nights out), Vue on 30A (rooftop with Gulf
          views), Grayton Seafood Co. &amp; Oyster Bar, and ice cream in Seaside
          after dinner.
        </li>
        <li>
          <strong>Outdoors:</strong> Biking the 30A corridor, Point Washington
          State Forest trails, paddleboard and kayak rentals along the coast.
        </li>
        <li>
          <strong>Day trips:</strong> Destin harbor and Crab Island area,
          Choctawhatchee Bay fishing or boat days.
        </li>
      </ul>

      <h2 className="text-lg font-semibold text-teal-950">
        Add dates to your calendar
      </h2>
      <p className="text-sm text-teal-800/85">
        On the{" "}
        <a className="font-medium text-teal-800 underline decoration-teal-400/50 underline-offset-2 hover:text-teal-950" href="/calendar">
          Calendar
        </a>{" "}
        page—after you’ve used your email link—you can download{" "}
        <em>just your stay</em>.
      </p>
    </article>
  );
}
