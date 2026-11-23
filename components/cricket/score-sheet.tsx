import type { ReactNode } from "react";
import type { BatterLine } from "@/lib/cricket/engine";
import type { SheetInnings } from "@/lib/cricket/sheet";

/**
 * The club's paper scorer's sheet (A4 landscape, one page per innings), drawn
 * as HTML so it prints crisply from any browser. The form itself is printed in
 * black; everything the app fills in is "pen" — the crest's blue — so a filled
 * sheet still reads as a scorebook, and a blank one is the form the scorers
 * already use. Styles are `.sheet*` in app/globals.css.
 */

export interface SheetHeader {
  home: string;
  visitor: string;
  inningsOf: string;
  playedAt: string;
  date: string;
  /** Tournament, match title, overs a side, toss — one line under the club name. */
  context: string;
  result: string;
}

const BAT_ROWS = 11;
const BOWL_ROWS = 8;
const BOWL_OVERS = 10;
const STRIP_OVERS = 20;
const TALLY_ROWS = 40; // 0 … 399

const blank = (n: number) => Array.from({ length: n }, (_, i) => i);

function howOut(line: BatterLine, closed: boolean, name: (id?: string | null) => string) {
  const out = line.out;
  if (!out) return line.atCrease ? (closed ? "not out" : "batting") : "retired hurt";
  switch (out.kind) {
    case "bowled":
      return "bowled";
    case "caught":
      return out.fielder && out.fielder !== out.bowler ? `ct ${name(out.fielder)}` : out.fielder ? "c & b" : "caught";
    case "lbw":
      return "lbw";
    case "stumped":
      return out.fielder ? `st ${name(out.fielder)}` : "stumped";
    case "hit_wicket":
      return "hit wicket";
    case "run_out":
      return out.fielder ? `run out (${name(out.fielder)})` : "run out";
  }
}

/** A filled-in value: blue "pen" on the black form. */
const Pen = ({ children }: { children: ReactNode }) => <span className="sheet-pen">{children}</span>;

export function ScoreSheet({
  header,
  innings,
  closed = false,
  name = () => "",
  oversPerInnings,
}: {
  header?: SheetHeader;
  innings?: SheetInnings | null;
  closed?: boolean;
  name?: (id?: string | null) => string;
  oversPerInnings?: number;
}) {
  const batters = innings?.batters ?? [];
  const bowlers = innings?.bowlers ?? [];
  const batRows = Math.max(BAT_ROWS, batters.length);
  const bowlRows = Math.max(BOWL_ROWS, bowlers.length);
  const bowlOvers = Math.max(BOWL_OVERS, ...bowlers.map((b) => b.overs.length));
  const stripOvers = Math.min(50, Math.max(STRIP_OVERS, oversPerInnings ?? 0, innings?.overs.length ?? 0));
  const tallyRows = Math.max(TALLY_ROWS, Math.floor((innings?.runs ?? 0) / 10) + 1);
  const wicketScores = new Set(innings?.falls.map((f) => f.score) ?? []);
  const total = innings?.runs ?? -1;
  const extras = innings?.extras;

  const headBox = (label: string, value?: string) => (
    <div className="sheet-box">
      <span className="sheet-label">{label}</span>
      <span className="sheet-box-value">{value ? <Pen>{value}</Pen> : null}</span>
    </div>
  );

  return (
    <section className="sheet">
      <header className="sheet-band">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/ksc-crest.png" alt="" className="sheet-crest" />
        <div className="min-w-0">
          <p className="sheet-club">Kavery Sports Club</p>
          {header?.context && <p className="sheet-context">{header.context}</p>}
        </div>
        <p className="sheet-kind">Scorer’s sheet</p>
      </header>

      <div className="sheet-head">
        {headBox("Home club", header?.home)}
        {headBox("Visitor", header?.visitor)}
        {headBox("Innings of", header?.inningsOf)}
        {headBox("Played at", header?.playedAt)}
        {headBox("Date", header?.date)}
      </div>

      <div className="sheet-body">
        <div className="sheet-main">
          <table className="sheet-table sheet-bat">
            <colgroup>
              <col style={{ width: "5mm" }} />
              <col style={{ width: "32mm" }} />
              <col style={{ width: "11mm" }} />
              <col style={{ width: "9mm" }} />
              <col />
              <col style={{ width: "4mm" }} />
              <col style={{ width: "6mm" }} />
              <col style={{ width: "24mm" }} />
              <col style={{ width: "22mm" }} />
              <col style={{ width: "10mm" }} />
            </colgroup>
            <thead>
              <tr>
                <th />
                <th className="text-left">Batsman</th>
                <th>In / out</th>
                <th>Balls</th>
                <th>Runs scored</th>
                <th colSpan={2}>4 / 6</th>
                <th>How out</th>
                <th>Bowler</th>
                <th>Runs</th>
              </tr>
            </thead>
            <tbody>
              {blank(batRows).map((i) => {
                const b = batters[i];
                const strokes = b?.strokes.join(" ") ?? "";
                return [
                  <tr key={`${i}a`} className="sheet-pair-top">
                    <td rowSpan={2} className="sheet-num">{i + 1}</td>
                    <td rowSpan={2} className="sheet-name">{b && <Pen>{name(b.id)}</Pen>}</td>
                    <td className="sheet-sub" />
                    <td rowSpan={2} className="sheet-fig">{b && <Pen>{b.balls}</Pen>}</td>
                    <td rowSpan={2} className={strokes.length > 70 ? "sheet-strokes sheet-strokes-long" : "sheet-strokes"}>
                      {strokes && <Pen>{strokes}</Pen>}
                    </td>
                    <td className="sheet-46">4</td>
                    <td className="sheet-fig">{b && b.fours > 0 && <Pen>{b.fours}</Pen>}</td>
                    <td rowSpan={2} className="sheet-name sheet-wrap">{b && <Pen>{howOut(b, closed, name)}</Pen>}</td>
                    <td rowSpan={2} className="sheet-name">{b?.out?.bowler && <Pen>{name(b.out.bowler)}</Pen>}</td>
                    <td rowSpan={2} className="sheet-fig sheet-strong">{b && <Pen>{b.runs}</Pen>}</td>
                  </tr>,
                  <tr key={`${i}b`}>
                    <td className="sheet-sub" />
                    <td className="sheet-46">6</td>
                    <td className="sheet-fig">{b && b.sixes > 0 && <Pen>{b.sixes}</Pen>}</td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>

          <div className="sheet-mid">
            <table className="sheet-table sheet-fow">
              <tbody>
                <tr>
                  <th className="text-left">Wicket</th>
                  {blank(10).map((i) => <th key={i}>{i + 1}</th>)}
                </tr>
                <tr>
                  <th className="text-left">Score</th>
                  {blank(10).map((i) => <td key={i}>{innings?.falls[i] && <Pen>{innings.falls[i].score}</Pen>}</td>)}
                </tr>
                <tr>
                  <th className="text-left">Batsman</th>
                  {blank(10).map((i) => <td key={i}>{innings?.falls[i]?.batter ? <Pen>{innings.falls[i].batter}</Pen> : null}</td>)}
                </tr>
              </tbody>
            </table>

            <table className="sheet-table sheet-extras">
              <tbody>
                <tr>
                  <th className="text-left">Wide</th>
                  <td>{extras && <Pen>{extras.wd}</Pen>}</td>
                  <th className="text-left">Total runs</th>
                  <td>{innings && extras && <Pen>{innings.runs - extras.total}</Pen>}</td>
                </tr>
                <tr>
                  <th className="text-left">No ball</th>
                  <td>{extras && <Pen>{extras.nb}</Pen>}</td>
                  <th className="text-left">Extras + pen</th>
                  <td>{extras && <Pen>{extras.total}</Pen>}</td>
                </tr>
                <tr>
                  <th className="text-left">Bye</th>
                  <td>{extras && <Pen>{extras.b}</Pen>}</td>
                  <th className="text-left" rowSpan={3}>Total score</th>
                  <td rowSpan={3} className="sheet-total">
                    {innings && (
                      <Pen>
                        {innings.runs}/{innings.wickets}
                        <span className="sheet-total-overs">{innings.oversText} ov</span>
                      </Pen>
                    )}
                  </td>
                </tr>
                <tr>
                  <th className="text-left">Leg bye</th>
                  <td>{extras && <Pen>{extras.lb}</Pen>}</td>
                </tr>
                <tr>
                  <th className="text-left">Pen</th>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          <table className="sheet-table sheet-bowl">
            <colgroup>
              <col style={{ width: "5mm" }} />
              <col style={{ width: "32mm" }} />
              {blank(bowlOvers).map((i) => <col key={i} />)}
              <col style={{ width: "9mm" }} />
              <col style={{ width: "8mm" }} />
              <col style={{ width: "9mm" }} />
              <col style={{ width: "7mm" }} />
              <col style={{ width: "9mm" }} />
              <col style={{ width: "7mm" }} />
            </colgroup>
            <thead>
              <tr>
                <th />
                <th className="text-left">Bowler</th>
                {blank(bowlOvers).map((i) => <th key={i}>{i + 1}</th>)}
                <th>Wides</th>
                <th>NB</th>
                <th>O</th>
                <th>M</th>
                <th>R</th>
                <th>W</th>
              </tr>
            </thead>
            <tbody>
              {blank(bowlRows).map((i) => {
                const b = bowlers[i];
                return (
                  <tr key={i}>
                    <td className="sheet-num">{i + 1}</td>
                    <td className="sheet-name">{b && <Pen>{name(b.id)}</Pen>}</td>
                    {blank(bowlOvers).map((o) => {
                      const over = b?.overs[o];
                      return (
                        <td key={o} className="sheet-over">
                          {over && (
                            <Pen>
                              {over.maiden ? "M" : over.runs}
                              {over.wickets > 0 && <span className="sheet-w">{"W".repeat(over.wickets)}</span>}
                            </Pen>
                          )}
                        </td>
                      );
                    })}
                    <td className="sheet-fig">{b && <Pen>{b.wides}</Pen>}</td>
                    <td className="sheet-fig">{b && <Pen>{b.noBalls}</Pen>}</td>
                    <td className="sheet-fig">{b && <Pen>{b.oversText}</Pen>}</td>
                    <td className="sheet-fig">{b && <Pen>{b.maidens}</Pen>}</td>
                    <td className="sheet-fig">{b && <Pen>{b.runs}</Pen>}</td>
                    <td className="sheet-fig sheet-strong">{b && <Pen>{b.wickets}</Pen>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside className="sheet-side">
          <table className="sheet-table sheet-tally" aria-label="Cumulative run tally">
            <thead>
              <tr>
                <th colSpan={10}>Cumulative run tally</th>
              </tr>
            </thead>
            <tbody>
              {blank(tallyRows).map((row) => (
                <tr key={row}>
                  {blank(10).map((n) => {
                    const run = row * 10 + n;
                    const label = n === 0;
                    if (run === 0) return <td key={n} className="sheet-tally-label" />;
                    const reached = run <= total;
                    return (
                      <td
                        key={n}
                        className={[
                          label ? "sheet-tally-label" : "",
                          reached ? "sheet-crossed" : "",
                          reached && wicketScores.has(run) ? "sheet-ringed" : "",
                          run === total ? "sheet-final" : "",
                        ].join(" ")}
                      >
                        {label ? run : n}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="sheet-result">
            <div>
              <span className="sheet-label">Score</span>
              <span className="sheet-box-value">{innings && <Pen>{innings.runs}</Pen>}</span>
            </div>
            <div>
              <span className="sheet-label">For</span>
              <span className="sheet-box-value">{innings && <Pen>{innings.wickets}</Pen>}</span>
            </div>
            <div className="sheet-result-wide">
              <span className="sheet-label">Result</span>
              <span className="sheet-box-value">{header?.result && <Pen>{header.result}</Pen>}</span>
            </div>
          </div>

          <div className="sheet-signs">
            {["Scorers", "Captains", "Umpires"].map((role) => (
              <div key={role} className="sheet-sign">
                <span className="sheet-label">{role}</span>
                <span className="sheet-line" />
                <span className="sheet-line" />
              </div>
            ))}
          </div>
        </aside>
      </div>

      <table className="sheet-table sheet-strip">
        <colgroup>
          <col style={{ width: "16mm" }} />
          {blank(stripOvers).map((i) => <col key={i} />)}
        </colgroup>
        <tbody>
          <tr>
            <th className="text-left">Over</th>
            {blank(stripOvers).map((i) => <th key={i}>{i + 1}</th>)}
          </tr>
          {(["Score", "Wickets", "Bowler"] as const).map((row) => (
            <tr key={row}>
              <th className="text-left">{row}</th>
              {blank(stripOvers).map((i) => {
                const over = innings?.overs[i];
                const value = !over ? null : row === "Score" ? over.score : row === "Wickets" ? over.wickets : over.bowler || null;
                return <td key={i}>{value !== null && <Pen>{value}</Pen>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
