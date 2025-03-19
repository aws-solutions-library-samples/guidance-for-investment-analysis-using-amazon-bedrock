import {
  SideNavigation,
  SideNavigationProps,
} from "@cloudscape-design/components";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { APP_NAME } from "../common/constants";
import { useNavigationPanelState } from "../common/hooks/use-navigation-panel-state";
import { useOnFollow } from "../common/hooks/use-on-follow";

export default function NavigationPanel() {
  const location = useLocation();
  const onFollow = useOnFollow();
  const [navigationPanelState, setNavigationPanelState] =
    useNavigationPanelState();

  const [items] = useState<SideNavigationProps.Item[]>(() => {
    const items: SideNavigationProps.Item[] = [
      {
        type: "link",
        text: "Home",
        href: "/",
      },
      {
        type: "link",
        text: "News and Sentiments Analysis",
        href: "/tickernews",
      },
      {
        type: "link",
        text: "Fundamental & Financials Analysis",
        href: "/fundamentalanalysis",
      },                  
      // {
      //   type: "link",
      //   text: "Qualitative Data Q&A",
      //   href: "/qualitativeqna",
      // },                  
      {
        type: "link",
        text: "Investment Analysis",
        href: "/investmentanalysis",
      },
      {
        type: "link",
        text: "Chat",
        href: "/chat"
      }                  
    ];

    items.push(
      { type: "divider" },
      {
        type: "link",
        text: "Documentation",
        href: "https://partnercentral.awspartner.com/partnercentral2/s/article?category=Industry_Partner_Solutions&article=Investment-Analysis-gen-AI-powered-Financial-Market-and-Investment-Opportunity-Analysis",
        external: true,
      }
    );

    return items;
  });

  const onChange = ({
    detail,
  }: {
    detail: SideNavigationProps.ChangeDetail;
  }) => {
    const sectionIndex = items.indexOf(detail.item);
    setNavigationPanelState({
      collapsedSections: {
        ...navigationPanelState.collapsedSections,
        [sectionIndex]: !detail.expanded,
      },
    });
  };

  return (
    <SideNavigation
      onFollow={onFollow}
      onChange={onChange}
      header={{ href: "/", text: APP_NAME }}
      activeHref={location.pathname}
      items={items.map((value, idx) => {
        if (value.type === "section") {
          const collapsed =
            navigationPanelState.collapsedSections?.[idx] === true;
          value.defaultExpanded = !collapsed;
        }

        return value;
      })}
    />
  );
}
