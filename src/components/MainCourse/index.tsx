import { useState } from 'react';

import { arrayRemove, arrayUnion, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useHistory } from 'react-router-dom';

import { CancelModal } from '@components';

import { db } from '@config';
import { useGetEnrollmentTerm } from '@hooks';
import { useGetProfile } from '@hooks/use-get-profile';
import {
  BLACK,
  COMMON_ALERT,
  COURSE_MEMBER_ALREADY_FULLED,
  ERROR_ALERT,
  FAILED_TO_APPLY_COURSE,
  FALIED_TO_DROP_COURSE,
  GRAY,
  RED,
  SUCCESS_APPLIED_COURSE,
  SUCCESS_DELETE_COURSE,
  SUCCESS_DROP_COURSE,
  defaultUserAttendance,
} from '@utility';

import { Loading } from '..';
import {
  StyledCaseSlash,
  StyledCourseBottom,
  StyledCourseButton,
  StyledCourseCancelButton,
  StyledCourseCase,
  StyledCourseCaseValue,
  StyledCourseInfo,
  StyledCourseLanguageImage,
  StyledCourseTitle,
  StyledCourseTop,
  StyledEmoji,
  StyledEmojiBackground,
  StyledLeader,
  StyledLeaderName,
  StyledLeaderType,
  StyledMainCourseContainer,
  StyledOtherLeadersName,
} from './style';

export const MainCourse = ({
  course,
  profileId,
  currentSemester,
}: {
  course: Course;
  profileId?: string;
  currentSemester: string;
}) => {
  const history = useHistory();

  const { isEnrollmentTerm } = useGetEnrollmentTerm();

  const { user, resetUser } = useGetProfile();
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelModalVisible, setIsCancelModalVisible] = useState(false);

  const {
    courseInfo,
    courseLeader,
    courseOtherLeaders,
    courseName,
    courseType,
    difficulty,
    language,
    requireTime,
    semester,
    id: courseId,
    maxMemberNum,
    courseMember,
  } = course;

  const onClickApplication = async () => {
    if (!user || isLoading || courseMember.length >= maxMemberNum) return;
    const { id: userId, courseHistory } = user;

    try {
      setIsLoading(true);
      const courseRef = doc(db, 'courses', courseId);
      const userRef = doc(db, 'users', userId);

      // course Update
      await updateDoc(courseRef, {
        courseMember: arrayUnion(userId),
        courseAttendance: arrayUnion({
          id: userId,
          attendance: defaultUserAttendance,
        }),
      });

      const { courseMember: newCourseMemeber } = (await getDoc(courseRef)).data() as Course;

      const overflowedCourseMember = newCourseMemeber.slice(maxMemberNum);

      if (newCourseMemeber.length > maxMemberNum && overflowedCourseMember.includes(userId)) {
        await updateDoc(courseRef, {
          courseMember: arrayRemove(userId),
          courseAttendance: arrayRemove({
            id: userId,
            attendance: defaultUserAttendance,
          }),
        });
        throw new Error();
      }

      // user Update
      await updateDoc(userRef, {
        courseHistory: [
          ...(courseHistory ?? []),
          {
            courseInfo,
            courseLeader,
            courseOtherLeaders,
            courseName,
            courseType,
            difficulty,
            language,
            requireTime,
            semester,
            id: courseId,
          },
        ],
      });
      resetUser();
      alert(SUCCESS_APPLIED_COURSE);
    } catch (error) {
      alert(`${FAILED_TO_APPLY_COURSE}`);
    } finally {
      setIsLoading(false);
    }
  };

  const dropCourse = async () => {
    if (!user || isLoading) return;
    const { id: userId, courseHistory } = user;

    try {
      setIsLoading(true);
      const courseRef = doc(db, 'courses', courseId);
      const userRef = doc(db, 'users', userId);
      const courseDoc = (await getDoc(courseRef)).data() as Course;
      // 세션장이면
      if (courseDoc.courseLeader.id === userId) {
        // 유저 history에서 삭제
        for await (const id of courseDoc.courseMember) {
          const targetUserRef = doc(db, 'users', id);
          const targetUserDoc = (await getDoc(targetUserRef)).data() as User;
          const newCourseHistory =
            targetUserDoc.courseHistory?.filter(course => course.id !== courseId) ?? [];

          await updateDoc(targetUserRef, {
            courseHistory: newCourseHistory,
          });
        }
        await deleteDoc(doc(db, 'courses', courseId));
        alert(SUCCESS_DELETE_COURSE);
      } else {
        const newCourseHistory = courseHistory?.filter(myCourse => myCourse.id !== courseId);
        const newCourseMember = courseDoc?.courseMember.filter(
          (memberId: string) => memberId !== userId,
        );
        const newCourseAttendance = courseDoc?.courseAttendance.filter(
          (member: any) => member.id !== userId,
        );
        const newCourseOtherLeaders = courseDoc?.courseOtherLeaders?.filter(
          (leader: any) => leader.id !== userId,
        );

        const updateData = {
          courseMember: newCourseMember ?? [],
          courseAttendance: newCourseAttendance,
          courseOtherLeaders: newCourseOtherLeaders,
        };

        // course Update
        await updateDoc(courseRef, updateData);

        // user Update
        await updateDoc(userRef, {
          courseHistory: newCourseHistory ?? [],
        });
        alert(SUCCESS_DROP_COURSE);
      }

      resetUser();
    } catch (error) {
      alert(`${FALIED_TO_DROP_COURSE} ${COMMON_ALERT} ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const checkIsCourseFulled = async () => {
    if (!user || isLoading) return;

    const courseRef = doc(db, 'courses', courseId);
    const userRef = doc(db, 'users', user.id);
    const { courseMember: serverCourseMember } = (await getDoc(courseRef)).data() as Course;
    const { courseHistory: serverCourseHistory } = (await getDoc(userRef)).data() as User;

    const isError =
      !serverCourseMember.includes(user.id) &&
      serverCourseHistory?.some(myCourse => myCourse.id === courseId);

    if (!isError) return;

    try {
      setIsLoading(true);
      const newCourseHistory = serverCourseHistory?.filter(myCourse => myCourse.id !== courseId);

      // user Update
      await updateDoc(userRef, {
        courseHistory: newCourseHistory ?? [],
      });

      resetUser();
      alert(COURSE_MEMBER_ALREADY_FULLED);
    } catch (error) {
      alert(`${ERROR_ALERT} ${COMMON_ALERT} ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const renderButton = () => {
    if (!user) {
      return (
        <StyledCourseButton
          bgColor={BLACK}
          onClick={e => {
            e.stopPropagation();
            history.push('/login');
          }}>
          로그인 후 확인
        </StyledCourseButton>
      );
    } else if (profileId) {
      return (
        (profileId === user?.id && (
          <StyledCourseCancelButton
            onClick={e => {
              e.stopPropagation();
              setIsCancelModalVisible(true);
            }}>
            수강 취소
          </StyledCourseCancelButton>
        )) || <></>
      );
    } else if (courseMember.includes(user?.id ?? '')) {
      return (
        <StyledCourseButton
          bgColor={BLACK}
          disabled={true}
          onClick={e => {
            e.stopPropagation();
          }}>
          수강중 {courseMember.length}/{maxMemberNum}
        </StyledCourseButton>
      );
    } else if (courseMember.length >= maxMemberNum) {
      return (
        <StyledCourseButton
          bgColor={GRAY}
          disabled={true}
          onClick={e => {
            e.stopPropagation();
          }}>
          {<>인원 마감&nbsp;</>}
          {courseMember.length}/{maxMemberNum}
        </StyledCourseButton>
      );
    } else if (!isEnrollmentTerm) {
      return (
        <StyledCourseButton bgColor={GRAY} disabled={true}>
          기간 마감
        </StyledCourseButton>
      );
    } else {
      return (
        <StyledCourseButton
          bgColor={RED}
          onClick={async e => {
            e.stopPropagation();
            await onClickApplication();
            await checkIsCourseFulled();
          }}>
          {<>신청하기&nbsp;</>}
          {courseMember.length}/{maxMemberNum}
        </StyledCourseButton>
      );
    }
  };

  return (
    <>
      <StyledMainCourseContainer
        onClick={() => {
          history.push(`/course/detail/${course.id}`);
        }}>
        {isLoading && <Loading />}
        <StyledLeader>
          <StyledEmojiBackground>
            <StyledEmoji>{course.courseLeader.emoji}</StyledEmoji>
          </StyledEmojiBackground>
          <StyledLeaderName>
            {course.courseLeader.name} <StyledLeaderType>팀장</StyledLeaderType>
            {course.courseOtherLeaders && course.courseOtherLeaders.length !== 0 && (
              <>
                <br />
                <StyledOtherLeadersName>
                  외 {course.courseOtherLeaders.length}명
                </StyledOtherLeadersName>
              </>
            )}
          </StyledLeaderName>
        </StyledLeader>
        <StyledCourseInfo>
          <StyledCourseTop>
            <StyledCourseTitle
              isEllipsisPC={courseName.length > 25}
              isEllipsisMobile={courseName.length > 10}>
              {courseName}
            </StyledCourseTitle>
            {language.slice(0, 3).map((res, index) => {
              return (
                <StyledCourseLanguageImage
                  key={index}
                  src={`/img/icon/${res}.svg`}
                  alt={`${res} 로고`}
                />
              );
            })}
          </StyledCourseTop>
          <StyledCourseBottom>
            <StyledCourseCase>
              난이도 :&nbsp;
              <StyledCourseCaseValue>{difficulty}</StyledCourseCaseValue>
            </StyledCourseCase>
            <StyledCaseSlash>/</StyledCaseSlash>
            <StyledCourseCase>
              투자시간 :&nbsp;
              <StyledCourseCaseValue>{requireTime}학점</StyledCourseCaseValue>
            </StyledCourseCase>
          </StyledCourseBottom>
        </StyledCourseInfo>
        {semester === currentSemester && renderButton()}
      </StyledMainCourseContainer>
      {isCancelModalVisible && (
        <CancelModal isPromptModalOpened={setIsCancelModalVisible} onCancel={dropCourse} />
      )}
    </>
  );
};
